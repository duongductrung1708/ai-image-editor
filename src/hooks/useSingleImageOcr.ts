import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";
import type { BoundingBox } from "@/components/ImageViewer";
import {
  buildOcrHtmlFromBlocks,
  normalizeBoundingBoxes,
} from "@/lib/bboxBlockHtml";
import { isVisualBboxKind } from "@/lib/bboxKinds";
import { cropBoundingBoxToDataUrl } from "@/lib/cropBoundingBox";
import { fileToBase64 } from "@/lib/fileToBase64";
import {
  isOcrErrorResponse,
  isOcrSuccessResponse,
  type OcrApiResponse,
} from "@/types/ocr";
import { looksLikeMarkdownTable } from "@/lib/ocrMarkdownHeuristics";
import {
  applyOcrFontFamiliesToHtml,
  applyOcrFontSizesToHtml,
} from "@/lib/ocrApplyFontSizes";
import { formatTopSplitHeaderAsTable } from "@/lib/ocrSplitHeaderTable";
import { applyStyledHeaderFromBlocks } from "@/lib/ocrRenderStyledHeaderFromBlocks";

const OCR_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-vietnamese`;

function normalizeOcrText(value: string): string {
  if (!value) return "";
  let out = value.trim();

  // Some providers/functions may return a JSON-encoded string inside a string.
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    try {
      const parsed = JSON.parse(out);
      if (typeof parsed === "string") out = parsed;
    } catch {
      // keep original
    }
  }

  // Normalize escaped newlines/tabs so markdown editor can render reliably.
  out = out.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  return out;
}

/**
 * Gọi API OCR một ảnh, lưu lịch sử, hỗ trợ Abort / hủy.
 */
export function useSingleImageOcr() {
  const { user, session } = useAuth();
  const [markdownText, setMarkdownText] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const ocrAbortRef = useRef<AbortController | null>(null);
  const ocrCancelRequestedRef = useRef(false);

  useEffect(() => {
    return () => {
      ocrAbortRef.current?.abort();
    };
  }, []);

  const runOcrOnFile = useCallback(async (file: File): Promise<boolean> => {
    ocrAbortRef.current?.abort();
    const controller = new AbortController();
    ocrAbortRef.current = controller;
    const { signal } = controller;

    setIsProcessing(true);
    setLoadingLabel("Chuẩn bị ảnh...");
    setLoadingProgress(10);
    setMarkdownText("");
    setJsonText("");
    setBoundingBoxes([]);
    let ok = false;

    try {
      setLoadingLabel("Đang mã hóa ảnh...");
      setLoadingProgress(25);
      const base64 = await fileToBase64(file);

      if (ocrCancelRequestedRef.current || signal.aborted) {
        return false;
      }

      setLoadingLabel("Đang gửi lên OCR...");
      setLoadingProgress(45);
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("Missing Authorization header");
      }
      const r = await fetch(OCR_FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
        signal,
      });

      setLoadingLabel("Đang phân tích kết quả...");
      setLoadingProgress(80);
      const data: OcrApiResponse | null = await r.json().catch(() => null);
      if (!r.ok) {
        const msg =
          data && isOcrErrorResponse(data) ? data.error : "OCR failed";
        throw new Error(msg);
      }

      if (!data || !isOcrSuccessResponse(data)) {
        throw new Error("OCR API returned unexpected response");
      }

      if (ocrCancelRequestedRef.current || signal.aborted) {
        return false;
      }

      const md = data.markdown.length > 0 ? normalizeOcrText(data.markdown) : "";
      const fullText = data.full_text.length > 0
        ? normalizeOcrText(data.full_text)
        : "";
      const rawBlocks: BoundingBox[] = Array.isArray(data.blocks)
        ? (data.blocks as unknown as BoundingBox[])
        : [];
      const normalizedBlocks = normalizeBoundingBoxes(rawBlocks);

      // Prefer real Markdown (e.g. pipe tables in full_text) over per-bbox <p> HTML;
      // otherwise the editor never renders GFM tables.
      let mdOut = "Không phát hiện văn bản.";
      if (looksLikeMarkdownTable(fullText)) {
        mdOut = fullText;
      } else if (looksLikeMarkdownTable(md)) {
        mdOut = md;
      } else if (md.length > 0) {
        mdOut = md;
      } else if (fullText.length > 0) {
        mdOut = fullText;
      }

      if (normalizedBlocks.length > 0) {
        const visualBlocks = normalizedBlocks.filter((b) =>
          isVisualBboxKind(b.kind),
        );

        // Nếu chỉ có text (không có con dấu/chữ ký/figure), đừng ghi đè markdown của model.
        // Việc ghi đè bằng HTML `<p data-bbox-id>` làm mất các style/định dạng model trả về.
        if (visualBlocks.length > 0) {
          const objectUrl = URL.createObjectURL(file);
          try {
            const cropUrls: Record<string, string> = {};
            await Promise.all(
              visualBlocks.map(async (b) => {
                const id = b.id;
                if (!id) return;
                try {
                  cropUrls[id] = await cropBoundingBoxToDataUrl(objectUrl, b);
                } catch {
                  /* crop thất bại — vẫn hiển thị placeholder trong HTML */
                }
              }),
            );

            const visualHtml = buildOcrHtmlFromBlocks(visualBlocks, {
              cropUrls,
            });
            if (visualHtml.length > 0) {
              mdOut = `${mdOut.trimEnd()}\n\n${visualHtml}`;
            }
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        }
      }

      if (normalizedBlocks.length > 0) {
        mdOut = applyStyledHeaderFromBlocks({
          markdown: mdOut,
          blocks: normalizedBlocks,
        });
      }

      mdOut = formatTopSplitHeaderAsTable(mdOut);

      // If OCR already returned HTML (<p style=...>...), inject per-line font-size
      // so TipTap can render closer to the original image.
      if (mdOut.trim().startsWith("<") && normalizedBlocks.length > 0) {
        mdOut = applyOcrFontSizesToHtml(mdOut, normalizedBlocks);
        mdOut = applyOcrFontFamiliesToHtml(mdOut, normalizedBlocks);
      }

      setMarkdownText(mdOut);
      setJsonText(
        JSON.stringify(
          {
            markdown: mdOut,
            full_text: fullText,
            blocks: normalizedBlocks,
            ...(typeof data.warning === "string"
              ? { warning: data.warning }
              : null),
          },
          null,
          2,
        ),
      );

      setBoundingBoxes(normalizedBlocks);

      setLoadingLabel("Đang lưu lịch sử...");
      setLoadingProgress(92);
      if (ocrCancelRequestedRef.current || signal.aborted) {
        return false;
      }
      await supabase.from("ocr_history").insert({
        image_name: file.name,
        extracted_text: mdOut,
        bounding_boxes: normalizedBlocks as unknown as Json,
        image_data: `data:${file.type};base64,${base64}`,
        user_id: user?.id,
      });
      setHistoryRefresh((p) => p + 1);
      setLoadingProgress(100);
      ok = true;
    } catch (err: unknown) {
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      if (aborted) {
        return false;
      }
      console.error("OCR error:", err);
      toast.error("Lỗi khi xử lý hình ảnh. Vui lòng thử lại.");
    } finally {
      if (ocrAbortRef.current === controller) {
        ocrAbortRef.current = null;
      }
      setIsProcessing(false);
      setLoadingLabel("");
      setLoadingProgress(0);
    }

    return ok;
  }, [session?.access_token, user]);

  const cancelProcessing = useCallback(() => {
    ocrCancelRequestedRef.current = true;
    ocrAbortRef.current?.abort();
    toast.info("Đã hủy OCR.");
  }, []);

  const clearCancelRequest = useCallback(() => {
    ocrCancelRequestedRef.current = false;
  }, []);

  const isCancelRequested = useCallback(
    () => ocrCancelRequestedRef.current,
    [],
  );

  const setOcrLoadingUi = useCallback((label: string, progress: number) => {
    setLoadingLabel(label);
    setLoadingProgress(progress);
  }, []);

  const clearOcrLoadingUi = useCallback(() => {
    setLoadingLabel("");
    setLoadingProgress(0);
  }, []);

  return {
    markdownText,
    setMarkdownText,
    jsonText,
    setJsonText,
    boundingBoxes,
    setBoundingBoxes,
    isProcessing,
    loadingLabel,
    loadingProgress,
    historyRefresh,
    runOcrOnFile,
    cancelProcessing,
    clearCancelRequest,
    isCancelRequested,
    setOcrLoadingUi,
    clearOcrLoadingUi,
  };
}
