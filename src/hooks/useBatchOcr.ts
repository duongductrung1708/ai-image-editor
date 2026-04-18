import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { OcrHistoryEntry } from "@/components/ocr/OcrHistoryMobileDrawer";
import type { BoundingBox } from "@/components/ImageViewer";
import { normalizeBoundingBoxes } from "@/lib/bboxBlockHtml";
import { fileToBase64 } from "@/lib/fileToBase64";
import { downscaleImageFile } from "@/lib/downscaleImageFile";
import { svgPlaceholderPage } from "@/lib/batchWorkspaceUtils";
import { formatTopSplitHeaderAsTable } from "@/lib/ocrSplitHeaderTable";
import { applyStyledHeaderFromBlocks } from "@/lib/ocrRenderStyledHeaderFromBlocks";
import {
  isOcrBatchSuccessResponse,
  isOcrErrorResponse,
  type OcrBatchPageResult,
} from "@/types/ocr";

const OCR_FUNCTION_URL =
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ocr-vietnamese`;

function normalizeOcrText(value: string): string {
  if (!value) return "";
  let out = value.trim();
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
  return out.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
}

function toVietnameseOcrError(raw: string): string {
  const msg = (raw || "").trim();
  if (!msg) return "Đã xảy ra lỗi khi OCR. Vui lòng thử lại.";

  const lower = msg.toLowerCase();
  if (lower.includes("gemini") && lower.includes("api 503")) {
    return "Gemini đang quá tải (503). Vui lòng thử lại sau ít phút.";
  }
  if (lower.includes("high demand")) {
    return "Hệ thống OCR đang quá tải. Vui lòng thử lại sau ít phút.";
  }
  if (lower.includes("missing authorization")) return "Thiếu đăng nhập/phiên làm việc. Vui lòng đăng nhập lại.";
  if (lower.includes("timed out") || lower.includes("timeout")) return "OCR bị quá thời gian. Vui lòng thử lại.";
  if (lower.includes("resource_limit")) return "Hệ thống xử lý quá tải. Vui lòng thử lại sau.";
  if (lower === "ocr batch failed") return "OCR hàng loạt thất bại. Vui lòng thử lại.";
  if (lower === "unexpected batch response") return "OCR hàng loạt trả về dữ liệu không đúng định dạng. Vui lòng thử lại.";

  return msg;
}

export type BatchPhase = "ready" | "processing" | "result";

export function useBatchOcr(files: File[]) {
  const { user, session } = useAuth();
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
  const [lastError, setLastError] = useState<string | null>(null);
  const [restoredFromHistory, setRestoredFromHistory] = useState(false);
  const [historyFirstImageData, setHistoryFirstImageData] = useState<
    string | null
  >(null);
  const [historyPageImageDatas, setHistoryPageImageDatas] = useState<
    Array<string | null>
  >([]);
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
        const img = historyPageImageDatas[i];
        if (img) {
          out.push(img);
          continue;
        }

        // Backward compatible:
        // Old history rows might only have preview_image_data (page 1) and not
        // store per-page preview images inside bounding_boxes.pages[].image_data.
        // If current session still has the same file names, use sourcePreviewUrls
        // to keep bbox overlay aligned with the displayed image.
        const pageName = batchPages?.[i]?.name;
        const fileName = files[i]?.name;
        if (
          sourcePreviewUrls[i] &&
          typeof pageName === "string" &&
          typeof fileName === "string" &&
          pageName === fileName
        ) {
          out.push(sourcePreviewUrls[i]);
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
    historyPageImageDatas,
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
    setLastError(null);
    setRestoredFromHistory(false);
    setHistoryFirstImageData(null);
    setHistoryPageImageDatas([]);

    try {
      const isRetryableGeminiOverload = (status: number, body: unknown): boolean => {
        if (status === 503) return true;
        const text =
          typeof body === "string"
            ? body
            : body && typeof body === "object"
              ? JSON.stringify(body)
              : "";
        const lower = text.toLowerCase();
        return lower.includes("high demand") || lower.includes("overload") || lower.includes("rate limit");
      };

      const backoffDelayMs = (attempt: number) => {
        const base = 800 * Math.pow(2, Math.max(0, attempt - 1));
        const jitter = Math.floor(Math.random() * 250);
        return Math.min(8000, base + jitter);
      };

      const fetchJsonWithRetry = async <T,>(
        url: string,
        init: RequestInit,
        opts: { maxAttempts?: number },
      ): Promise<{ res: Response; data: T | null }> => {
        const maxAttempts = opts.maxAttempts ?? 4;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          if (signal.aborted) throw new Error("AbortError");
          const res = await fetch(url, init);
          const data = (await res.json().catch(() => null)) as T | null;
          if (res.ok) return { res, data };

          if (attempt < maxAttempts && isRetryableGeminiOverload(res.status, data)) {
            toast.info(`Hệ thống OCR đang quá tải, đang thử lại (${attempt + 1}/${maxAttempts})…`);
            await sleep(backoffDelayMs(attempt));
            continue;
          }
          return { res, data };
        }
        return { res: new Response(null, { status: 503 }), data: null };
      };

      // Client-side limits (fast feedback)
      const maxImages = 30;
      if (files.length > maxImages) {
        throw new Error(`Quá nhiều ảnh (tối đa ${maxImages}).`);
      }
      const maxBytesPerImage = 4_000_000;
      const tooLarge = files.find((f) => f.size > maxBytesPerImage);
      if (tooLarge) {
        throw new Error(
          `Ảnh quá lớn: "${tooLarge.name}" (${tooLarge.size} bytes). Tối đa ${maxBytesPerImage} bytes/ảnh.`,
        );
      }

      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("Missing Authorization header");
      }

      const images = await Promise.all(
        files.map(async (f) => {
          const maxSidePx = Number(import.meta.env.VITE_OCR_MAX_SIDE_PX) || 2000;
          const quality = Number(import.meta.env.VITE_OCR_IMAGE_QUALITY) || 0.82;
          const scaled = await downscaleImageFile(f, {
            maxSidePx,
            quality,
            outputMimeType: "image/jpeg",
          });
          return {
            name: f.name,
            mimeType: scaled.type || f.type || "image/png",
            imageBase64: await fileToBase64(scaled),
          };
        }),
      );

      const { res: r, data } = await fetchJsonWithRetry<unknown>(
        `${OCR_FUNCTION_URL}/batch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ images }),
          signal,
        },
        { maxAttempts: 4 },
      );

      if (!r.ok) {
        const msg =
          data && isOcrErrorResponse(data) ? data.error : "OCR batch failed";
        throw new Error(msg);
      }
      if (!data || !isOcrBatchSuccessResponse(data)) {
        throw new Error("Unexpected batch response");
      }

      const normalizedPages = data.pages.map((p, idx) => ({
        ...p,
        markdown: (() => {
          const blocks = Array.isArray(p.blocks)
            ? normalizeBoundingBoxes(p.blocks as BoundingBox[], idx)
            : [];
          const base = normalizeOcrText(p.markdown);
          const styled = blocks.length > 0
            ? applyStyledHeaderFromBlocks({ markdown: base, blocks })
            : base;
          return formatTopSplitHeaderAsTable(styled);
        })(),
        full_text: normalizeOcrText(p.full_text),
        blocks: Array.isArray(p.blocks)
          ? normalizeBoundingBoxes(p.blocks as BoundingBox[], idx)
          : [],
      }));
      const normalizedData = {
        ...data,
        markdown: formatTopSplitHeaderAsTable(
          applyStyledHeaderFromBlocks({
            markdown: normalizeOcrText(data.markdown),
            blocks: normalizedPages.flatMap((p) => p.blocks ?? []),
          }),
        ),
        full_text: normalizeOcrText(data.full_text),
        pages: normalizedPages,
      };

      const okCount = normalizedData.pages.filter((p) => p.ok).length;
      const failCount = normalizedData.pages.length - okCount;
      setMarkdownText(normalizedData.markdown);
      setJsonText(JSON.stringify(normalizedData, null, 2));
      setLastBatchMeta({
        okCount,
        failCount,
        concurrency: normalizedData.concurrency,
      });
      setBatchPages(normalizedData.pages);
      setRestoredFromHistory(false);
      setHistoryFirstImageData(null);
      setPhase("result");

      try {
        const previewByIndex = images.map(
          (img) => `data:${img.mimeType};base64,${img.imageBase64}`,
        );
        const preview_image_data = previewByIndex[0] ?? null;

        // Insert batch session
        const { data: session, error: sessErr } = await supabase
          .from("ocr_batch_sessions")
          .insert({
            page_count: normalizedData.pages.length,
            ok_count: okCount,
            fail_count: failCount,
            concurrency: normalizedData.concurrency,
            merged_markdown: normalizedData.markdown,
            preview_image_data,
            user_id: user?.id,
          })
          .select("id")
          .single();

        if (sessErr) throw sessErr;

        // Insert batch pages with image data for each page
        const pageRows = normalizedData.pages.map((p) => ({
          session_id: session.id,
          page_index: p.index,
          file_name: p.name,
          ok: p.ok,
          markdown: p.markdown,
          full_text: p.full_text,
          blocks: (p.blocks ?? []) as unknown as Json,
          error: p.error ?? null,
          image_data: previewByIndex[p.index] ?? null,
        }));
        await supabase.from("ocr_batch_pages").insert(pageRows);

        // Also save to ocr_history for unified history view
        await supabase.from("ocr_history").insert({
          image_name: `Hàng loạt (${files.length} ảnh)`,
          extracted_text: normalizedData.markdown,
          bounding_boxes: {
            batch: true,
            batch_session_id: session.id,
            pages: normalizedData.pages.map((p) => ({
              index: p.index,
              name: p.name,
              ok: p.ok,
              markdown: p.markdown,
              full_text: p.full_text,
              blocks: p.blocks,
              image_data: previewByIndex[p.index] ?? null,
            })),
          } as unknown as Json,
          image_data: preview_image_data,
          user_id: user?.id,
        });
        setHistoryRefresh((k) => k + 1);
      } catch (histErr) {
        console.warn("[batch] lưu lịch sử:", histErr);
      }

      if (failCount > 0) {
        toast.warning(
          `Hoàn tất: ${okCount}/${normalizedData.pages.length} trang thành công, ${failCount} lỗi.`,
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
      const msgRaw = e instanceof Error ? e.message : "Lỗi khi xử lý hàng loạt.";
      const msg = toVietnameseOcrError(msgRaw);
      toast.error(msg);
      setLastError(msg);
      setPhase("ready");
    } finally {
      if (batchAbortRef.current === controller) {
        batchAbortRef.current = null;
      }
      setIsProcessing(false);
    }
  }, [files, isProcessing, session?.access_token, user?.id]);

  const cancelBatch = useCallback(() => {
    batchAbortRef.current?.abort();
  }, []);

  const applyHistoryEntry = useCallback((entry: OcrHistoryEntry) => {
    batchAbortRef.current?.abort();
    const bb = entry.bounding_boxes;
    type OcrBatchPageResultWithImage = OcrBatchPageResult & {
      image_data?: string | null;
    };
    if (
      bb &&
      typeof bb === "object" &&
      !Array.isArray(bb) &&
      (bb as { batch?: boolean }).batch === true &&
      Array.isArray((bb as { pages?: unknown }).pages)
    ) {
      const pages = (bb as { pages: OcrBatchPageResultWithImage[] }).pages;
      setBatchPages(pages);
      setMarkdownText(entry.extracted_text);
      setJsonText(
        JSON.stringify({ markdown: entry.extracted_text, pages }, null, 2),
      );
      setRestoredFromHistory(true);
      setHistoryFirstImageData(entry.image_data);
      setHistoryPageImageDatas(pages.map((p) => p.image_data ?? null));
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
    setHistoryPageImageDatas([]);
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
    setMarkdownText,
    jsonText,
    setJsonText,
    isProcessing,
    activeTab,
    setActiveTab,
    lastBatchMeta,
    batchPages,
    historyRefresh,
    lastError,
    setLastError,
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
