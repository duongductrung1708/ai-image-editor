import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";
import type { BoundingBox } from "@/components/ImageViewer";
import { fileToBase64 } from "@/lib/fileToBase64";
import {
  isOcrErrorResponse,
  isOcrSuccessResponse,
  type OcrApiResponse,
} from "@/types/ocr";

/**
 * Gọi API OCR một ảnh, lưu lịch sử, hỗ trợ Abort / hủy.
 */
export function useSingleImageOcr() {
  const { user } = useAuth();
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
      const r = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      const md = data.markdown.length > 0 ? data.markdown : "";
      const fullText = data.full_text.length > 0 ? data.full_text : "";
      const blocks: BoundingBox[] = Array.isArray(data.blocks)
        ? (data.blocks as unknown as BoundingBox[])
        : [];

      const mdOut =
        md.length > 0
          ? md
          : fullText.length > 0
            ? fullText
            : "Không phát hiện văn bản.";
      setMarkdownText(mdOut);
      setJsonText(
        JSON.stringify(
          {
            markdown: mdOut,
            full_text: fullText,
            blocks,
            ...(typeof data.warning === "string"
              ? { warning: data.warning }
              : null),
          },
          null,
          2,
        ),
      );

      setBoundingBoxes(blocks);

      setLoadingLabel("Đang lưu lịch sử...");
      setLoadingProgress(92);
      if (ocrCancelRequestedRef.current || signal.aborted) {
        return false;
      }
      await supabase.from("ocr_history").insert({
        image_name: file.name,
        extracted_text: mdOut,
        bounding_boxes: blocks as unknown as Json,
        image_data: `data:${file.type};base64,${base64}`,
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
  }, []);

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
