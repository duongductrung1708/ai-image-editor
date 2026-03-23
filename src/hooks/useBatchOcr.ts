import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { OcrHistoryEntry } from "@/components/ocr/OcrHistoryMobileDrawer";
import type { BoundingBox } from "@/components/ImageViewer";
import { fileToBase64 } from "@/lib/fileToBase64";
import { svgPlaceholderPage } from "@/lib/batchWorkspaceUtils";
import {
  isOcrBatchSuccessResponse,
  isOcrErrorResponse,
  type OcrBatchPageResult,
} from "@/types/ocr";

export type BatchPhase = "ready" | "processing" | "result";

export function useBatchOcr(files: File[]) {
  const [phase, setPhase] = useState<BatchPhase>("ready");
  const [markdownText, setMarkdownText] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"markdown" | "json">("markdown");
  const [lastBatchMeta, setLastBatchMeta] = useState<{
    okCount: number;
    failCount: number;
    concurrency: number;
  } | null>(null);
  const [batchPages, setBatchPages] = useState<OcrBatchPageResult[] | null>(
    null,
  );
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [restoredFromHistory, setRestoredFromHistory] = useState(false);
  const [historyFirstImageData, setHistoryFirstImageData] = useState<
    string | null
  >(null);
  const [sourcePreviewUrls, setSourcePreviewUrls] = useState<string[]>([]);

  const batchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      batchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setSourcePreviewUrls(urls);
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [files]);

  const totalBytes = useMemo(
    () => files.reduce((sum, f) => sum + f.size, 0),
    [files],
  );

  const extensionSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of files) {
      const name = f.name.toLowerCase();
      const dot = name.lastIndexOf(".");
      const ext = dot >= 0 ? name.slice(dot) : "khác";
      map.set(ext, (map.get(ext) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [files]);

  const pageCount = batchPages?.length ?? files.length;

  const effectivePreviewUrls = useMemo(() => {
    const n = Math.max(1, batchPages?.length ?? files.length);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const title = batchPages?.[i]?.name ?? files[i]?.name ?? `Trang ${i + 1}`;
      if (restoredFromHistory) {
        if (i === 0 && historyFirstImageData) {
          out.push(historyFirstImageData);
        } else {
          out.push(svgPlaceholderPage(title));
        }
      } else if (sourcePreviewUrls[i]) {
        out.push(sourcePreviewUrls[i]);
      } else {
        out.push(svgPlaceholderPage(title));
      }
    }
    return out;
  }, [
    batchPages,
    files,
    sourcePreviewUrls,
    restoredFromHistory,
    historyFirstImageData,
  ]);

  const totalBoxCount = useMemo(() => {
    if (!batchPages) return 0;
    return batchPages.reduce(
      (s, p) => s + (Array.isArray(p.blocks) ? p.blocks.length : 0),
      0,
    );
  }, [batchPages]);

  const runBatch = useCallback(async () => {
    if (isProcessing || files.length === 0) return;
    batchAbortRef.current?.abort();
    const controller = new AbortController();
    batchAbortRef.current = controller;
    const { signal } = controller;

    setIsProcessing(true);
    setPhase("processing");
    setMarkdownText("");
    setJsonText("");
    setLastBatchMeta(null);
    setBatchPages(null);
    setRestoredFromHistory(false);
    setHistoryFirstImageData(null);

    try {
      const images = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          mimeType: f.type || "image/png",
          imageBase64: await fileToBase64(f),
        })),
      );

      const r = await fetch("/api/ocr/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
        signal,
      });

      const data: unknown = await r.json().catch(() => null);
      if (!r.ok) {
        const msg =
          data && isOcrErrorResponse(data) ? data.error : "OCR batch failed";
        throw new Error(msg);
      }
      if (!data || !isOcrBatchSuccessResponse(data)) {
        throw new Error("Unexpected batch response");
      }

      const okCount = data.pages.filter((p) => p.ok).length;
      const failCount = data.pages.length - okCount;
      setMarkdownText(data.markdown);
      setJsonText(JSON.stringify(data, null, 2));
      setLastBatchMeta({
        okCount,
        failCount,
        concurrency: data.concurrency,
      });
      setBatchPages(data.pages);
      setRestoredFromHistory(false);
      setHistoryFirstImageData(null);
      setPhase("result");

      try {
        const firstB64 = await fileToBase64(files[0]);
        const mime = files[0].type || "image/png";
        const preview_image_data = `data:${mime};base64,${firstB64}`;

        // Insert batch session
        const { data: session, error: sessErr } = await supabase
          .from("ocr_batch_sessions")
          .insert({
            page_count: data.pages.length,
            ok_count: okCount,
            fail_count: failCount,
            concurrency: data.concurrency,
            merged_markdown: data.markdown,
            preview_image_data,
          })
          .select("id")
          .single();

        if (sessErr) throw sessErr;

        // Insert batch pages
        const pageRows = data.pages.map((p) => ({
          session_id: session.id,
          page_index: p.index,
          file_name: p.name,
          ok: p.ok,
          markdown: p.markdown,
          full_text: p.full_text,
          blocks: (p.blocks ?? []) as unknown as Json,
          error: p.error ?? null,
        }));
        await supabase.from("ocr_batch_pages").insert(pageRows);

        // Also save to ocr_history for unified history view
        await supabase.from("ocr_history").insert({
          image_name: `Hàng loạt (${files.length} ảnh)`,
          extracted_text: data.markdown,
          bounding_boxes: {
            batch: true,
            batch_session_id: session.id,
            pages: data.pages.map((p) => ({
              index: p.index,
              name: p.name,
              ok: p.ok,
              markdown: p.markdown,
              full_text: p.full_text,
              blocks: p.blocks,
            })),
          } as unknown as Json,
          image_data: preview_image_data,
        });
        setHistoryRefresh((k) => k + 1);
      } catch (histErr) {
        console.warn("[batch] lưu lịch sử:", histErr);
      }

      if (failCount > 0) {
        toast.warning(
          `Hoàn tất: ${okCount}/${data.pages.length} trang thành công, ${failCount} lỗi.`,
        );
      } else {
        toast.success(`Đã OCR xong ${okCount} trang.`);
      }
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      if (aborted) {
        setPhase("ready");
        toast.info("Đã hủy OCR hàng loạt.");
        return;
      }
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Lỗi khi xử lý hàng loạt.");
      setPhase("ready");
    } finally {
      if (batchAbortRef.current === controller) {
        batchAbortRef.current = null;
      }
      setIsProcessing(false);
    }
  }, [files, isProcessing]);

  const cancelBatch = useCallback(() => {
    batchAbortRef.current?.abort();
  }, []);

  const applyHistoryEntry = useCallback((entry: OcrHistoryEntry) => {
    batchAbortRef.current?.abort();
    const bb = entry.bounding_boxes;
    if (
      bb &&
      typeof bb === "object" &&
      !Array.isArray(bb) &&
      (bb as { batch?: boolean }).batch === true &&
      Array.isArray((bb as { pages?: unknown }).pages)
    ) {
      const pages = (bb as { pages: OcrBatchPageResult[] }).pages;
      setBatchPages(pages);
      setMarkdownText(entry.extracted_text);
      setJsonText(
        JSON.stringify({ markdown: entry.extracted_text, pages }, null, 2),
      );
      setRestoredFromHistory(true);
      setHistoryFirstImageData(entry.image_data);
      const okCount = pages.filter((p) => p.ok).length;
      setLastBatchMeta({
        okCount,
        failCount: pages.length - okCount,
        concurrency: 0,
      });
      setPhase("result");
      setActiveTab("markdown");
      toast.success("Đã mở bản ghi OCR hàng loạt từ lịch sử.");
      return;
    }

    toast.info(
      "Bản ghi OCR một ảnh — chỉ tải văn bản vào editor (ảnh/bbox hàng loạt không đổi).",
    );
    setBatchPages(null);
    setRestoredFromHistory(false);
    setHistoryFirstImageData(null);
    setMarkdownText(entry.extracted_text);
    const flatBlocks = Array.isArray(bb)
      ? (bb as unknown as BoundingBox[])
      : [];
    setJsonText(
      JSON.stringify(
        {
          markdown: entry.extracted_text,
          full_text: entry.extracted_text,
          blocks: flatBlocks,
        },
        null,
        2,
      ),
    );
    setPhase("result");
    setActiveTab("markdown");
  }, []);

  return {
    phase,
    markdownText,
    jsonText,
    setJsonText,
    isProcessing,
    activeTab,
    setActiveTab,
    lastBatchMeta,
    batchPages,
    historyRefresh,
    restoredFromHistory,
    sourcePreviewUrls,
    totalBytes,
    extensionSummary,
    effectivePreviewUrls,
    pageCount,
    totalBoxCount,
    runBatch,
    cancelBatch,
    applyHistoryEntry,
  };
}
