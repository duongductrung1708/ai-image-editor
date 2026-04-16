import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { downscaleImageFile } from "@/lib/downscaleImageFile";
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
const OCR_JOB_START_URL = `${OCR_FUNCTION_URL}/job/start`;
const OCR_JOB_GET_URL = `${OCR_FUNCTION_URL}/job`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
  const qc = useQueryClient();
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
    let historyRowId: string | null = null;

    try {
      setLoadingLabel("Đang mã hóa ảnh...");
      setLoadingProgress(25);
      // Downscale để giảm khả năng Supabase worker bị RESOURCE_LIMIT (546)
      const maxSidePx = Number(import.meta.env.VITE_OCR_MAX_SIDE_PX) || 2000;
      const quality = Number(import.meta.env.VITE_OCR_IMAGE_QUALITY) || 0.82;
      const liteFirst = String(import.meta.env.VITE_OCR_LITE_FIRST || "1") === "1";
      const useAsyncJobs =
        String(import.meta.env.VITE_OCR_ASYNC_JOBS || "0") === "1";
      const scaled = await downscaleImageFile(file, {
        maxSidePx,
        quality,
        outputMimeType: "image/jpeg",
      });
      const base64 = await fileToBase64(scaled);

      if (ocrCancelRequestedRef.current || signal.aborted) {
        return false;
      }

      setLoadingLabel("Đang gửi lên OCR...");
      setLoadingProgress(45);
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("Missing Authorization header");
      }
      const bodyBase = {
        imageBase64: base64,
        mimeType: scaled.type || file.type,
      };

      let data: OcrApiResponse | null = null;
      let blocksFromProvider: BoundingBox[] = [];
      let md = "";
      let fullText = "";

      if (useAsyncJobs) {
        // Start job, return jobId quickly, then poll until done.
        const r0 = await fetch(OCR_JOB_START_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(bodyBase),
          signal,
        });
        const startData: { jobId?: string; error?: string } | null =
          await r0.json().catch(() => null);
        if (!r0.ok || !startData?.jobId) {
          const msg = startData?.error || "Không thể tạo OCR job";
          throw new Error(msg);
        }

        setLoadingLabel("Đang OCR (job)…");
        setLoadingProgress(60);

        const jobId = startData.jobId;
        const pollStart = Date.now();
        const POLL_TIMEOUT_MS = 10 * 60 * 1000;

        for (;;) {
          if (ocrCancelRequestedRef.current || signal.aborted) return false;
          if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
            throw new Error("OCR job timed out");
          }

          const rj = await fetch(`${OCR_JOB_GET_URL}?id=${encodeURIComponent(jobId)}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}` },
            signal,
          });
          const job:
            | {
                status?: string;
                result?: {
                  markdown?: string;
                  full_text?: string;
                  blocks?: BoundingBox[];
                };
                error?: string | null;
              }
            | null = await rj.json().catch(() => null);

          if (!rj.ok) {
            const msg = job?.error || "Không thể lấy trạng thái OCR job";
            throw new Error(msg);
          }

          const status = String(job?.status || "");
          if (status === "done") {
            md = typeof job?.result?.markdown === "string"
              ? normalizeOcrText(job!.result!.markdown!)
              : "";
            fullText = typeof job?.result?.full_text === "string"
              ? normalizeOcrText(job!.result!.full_text!)
              : "";
            blocksFromProvider = Array.isArray(job?.result?.blocks)
              ? (job!.result!.blocks as unknown as BoundingBox[])
              : [];
            break;
          }
          if (status === "failed") {
            throw new Error(job?.error || "OCR job failed");
          }

          // progress pulse 60..85
          setLoadingProgress((p) => Math.min(85, Math.max(60, p + 1)));
          await sleep(1200);
        }
      } else {
        const r = await fetch(OCR_FUNCTION_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(liteFirst ? { ...bodyBase, lite: true } : bodyBase),
          signal,
        });

        setLoadingLabel("Đang phân tích kết quả...");
        setLoadingProgress(80);
        data = await r.json().catch(() => null);
        if (!r.ok) {
          const msg =
            data && isOcrErrorResponse(data) ? data.error : "OCR failed";
          throw new Error(msg);
        }

        if (!data || !isOcrSuccessResponse(data)) {
          throw new Error("OCR API returned unexpected response");
        }

        md = data.markdown.length > 0 ? normalizeOcrText(data.markdown) : "";
        fullText = data.full_text.length > 0
          ? normalizeOcrText(data.full_text)
          : "";
        blocksFromProvider = Array.isArray(data.blocks)
          ? (data.blocks as unknown as BoundingBox[])
          : [];
      }

      if (ocrCancelRequestedRef.current || signal.aborted) {
        return false;
      }

      const normalizedBlocks = normalizeBoundingBoxes(blocksFromProvider);

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

      // Save history ASAP (step 1 output). Step 2 will update this row.
      setLoadingLabel("Đang lưu lịch sử...");
      setLoadingProgress(92);
      if (ocrCancelRequestedRef.current || signal.aborted) {
        return false;
      }
      // IMPORTANT: Don't rely on `.select("id")` after insert because RLS may block SELECT
      // even when INSERT is allowed. Generate id client-side so step 2 can always UPDATE.
      const newHistoryId =
        typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : null;
      const { error: insertErr } = await supabase.from("ocr_history").insert({
        ...(newHistoryId ? { id: newHistoryId } : null),
        image_name: file.name,
        extracted_text: mdOut,
        bounding_boxes: normalizedBlocks as unknown as Json,
        image_data: `data:${scaled.type || file.type};base64,${base64}`,
        user_id: user?.id,
      });
      if (insertErr) {
        console.error("[ocr-history] insert failed:", insertErr);
        toast.error("Không thể lưu lịch sử OCR.");
      } else if (newHistoryId) {
        historyRowId = newHistoryId;
      }
      await qc.invalidateQueries({ queryKey: ["ocr_history"] });

      // Step 2 (background): fetch blocks with json-mode only when lite-first is enabled
      if (liteFirst && !useAsyncJobs) {
        try {
          const r2 = await fetch(OCR_FUNCTION_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ ...bodyBase, blocksOnly: true }),
            signal,
          });
          const data2: OcrApiResponse | null = await r2.json().catch(() => null);
          if (r2.ok && data2 && isOcrSuccessResponse(data2)) {
            const rawBlocks2: BoundingBox[] = Array.isArray(data2.blocks)
              ? (data2.blocks as unknown as BoundingBox[])
              : [];
            const normalizedBlocks2 = normalizeBoundingBoxes(rawBlocks2);
            setBoundingBoxes(normalizedBlocks2);

            // Re-apply styled header if blocks are available
            let mdOut2 = mdOut;
            if (normalizedBlocks2.length > 0) {
              mdOut2 = applyStyledHeaderFromBlocks({
                markdown: mdOut2,
                blocks: normalizedBlocks2,
              });
            }
            mdOut2 = formatTopSplitHeaderAsTable(mdOut2);
            if (mdOut2.trim().startsWith("<") && normalizedBlocks2.length > 0) {
              mdOut2 = applyOcrFontSizesToHtml(mdOut2, normalizedBlocks2);
              mdOut2 = applyOcrFontFamiliesToHtml(mdOut2, normalizedBlocks2);
            }
            if (mdOut2 !== mdOut) setMarkdownText(mdOut2);

            setJsonText(
              JSON.stringify(
                {
                  markdown: mdOut2,
                  full_text: fullText,
                  blocks: normalizedBlocks2,
                  ...(typeof data2.warning === "string"
                    ? { warning: data2.warning }
                    : null),
                },
                null,
                2,
              ),
            );

            // Update history row with final blocks/text (best-effort)
            if (historyRowId && !ocrCancelRequestedRef.current && !signal.aborted) {
              const { error: updateErr } = await supabase
                .from("ocr_history")
                .update({
                  extracted_text: mdOut2,
                  bounding_boxes: normalizedBlocks2 as unknown as Json,
                })
                .eq("id", historyRowId);
              if (updateErr) {
                console.error("[ocr-history] update failed:", updateErr);
              }
              await qc.invalidateQueries({ queryKey: ["ocr_history"] });
            }
          }
        } catch {
          // ignore background blocks failure
        }
      }
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
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Lỗi khi xử lý hình ảnh. Vui lòng thử lại.";
      toast.error(msg);
    } finally {
      if (ocrAbortRef.current === controller) {
        ocrAbortRef.current = null;
      }
      setIsProcessing(false);
      setLoadingLabel("");
      setLoadingProgress(0);
    }

    return ok;
  }, [qc, session?.access_token, user]);

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
