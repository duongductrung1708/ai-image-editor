import { useState, useCallback, useEffect, useRef } from "react";
import type { OcrHistoryEntry } from "@/components/ocr/OcrHistoryMobileDrawer";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { BoundingBox } from "@/components/ImageViewer";
import type { ImageCropperApi } from "@/components/ocr/ImageCropper";
import type { Json } from "@/integrations/supabase/types";
import OCRToolbar from "@/components/ocr/OCRToolbar";
import OcrHistoryMobileDrawer from "@/components/ocr/OcrHistoryMobileDrawer";
import SingleImageEditPhase from "@/components/ocr/single/SingleImageEditPhase";
import SingleImageResultPhase from "@/components/ocr/single/SingleImageResultPhase";
import HistorySidebar from "@/components/HistorySidebar";
import { useIsLgScreen } from "@/hooks/useMediaQueryMinWidth";
import { useOcrMarkdownEditor } from "@/hooks/useOcrMarkdownEditor";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { useSingleImageOcr } from "@/hooks/useSingleImageOcr";
import { useSingleImageExportActions } from "@/hooks/useSingleImageExportActions";
import { useOcrQuota } from "@/hooks/useOcrQuota";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { enhanceFile } from "@/lib/imageProcessing";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { normalizeBoundingBoxes } from "@/lib/bboxBlockHtml";
import { applyStyledHeaderFromBlocks } from "@/lib/ocrRenderStyledHeaderFromBlocks";
import { formatTopSplitHeaderAsTable } from "@/lib/ocrSplitHeaderTable";
import {
  applyOcrFontFamiliesToHtml,
  applyOcrFontSizesToHtml,
} from "@/lib/ocrApplyFontSizes";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, X } from "lucide-react";

interface OCRWorkspaceProps {
  imageFile: File;
  onBack: () => void;
  initialHistoryEntry?: {
    id: string;
    image_name: string;
    extracted_text: string;
    bounding_boxes: Json | null;
    image_data: string | null;
    created_at: string;
  } | null;
  onRequestOpenHistory?: (entry: OcrHistoryEntry) => void;
  onSwitchToBatch?: (file: File) => void;
}

const OCRWorkspace = ({
  imageFile,
  onBack,
  initialHistoryEntry = null,
  onRequestOpenHistory,
  onSwitchToBatch,
}: OCRWorkspaceProps) => {
  const { user } = useAuth();
  const [imageUrl, setImageUrl] = useState("");
  const showHistory = useWorkspaceStore((s) => s.showHistory);
  const setShowHistory = useWorkspaceStore((s) => s.setShowHistory);
  const toggleHistoryOpen = useWorkspaceStore((s) => s.toggleHistory);
  const activeTab = useWorkspaceStore((s) => s.singleActiveTab);
  const setActiveTab = useWorkspaceStore((s) => s.setSingleActiveTab);
  const resetWorkspaceUi = useWorkspaceStore((s) => s.reset);
  const [markdownLinkedBoxIndices, setMarkdownLinkedBoxIndices] = useState<
    number[] | null
  >(null);
  const isLg = useIsLgScreen();

  const [phase, setPhase] = useState<"edit" | "processing" | "result">("edit");
  const [editFile, setEditFile] = useState<File>(imageFile);
  const [enhance, setEnhance] = useState(false);
  const [isEditingBusy, setIsEditingBusy] = useState(false);

  const editImageUrl = useObjectUrl(editFile);

  const lastOcrBlobUrlRef = useRef<string | null>(null);
  const cropperApiRef = useRef<ImageCropperApi | null>(null);

  const ocrPipelineBusy = phase === "processing";

  const {
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
    currentHistoryId,
    setCurrentHistoryId,
    lastError,
    setLastError,
    runOcrOnFile,
    cancelProcessing,
    clearCancelRequest,
    isCancelRequested,
    setOcrLoadingUi,
    clearOcrLoadingUi,
  } = useSingleImageOcr();

  const qc = useQueryClient();
  const lastAutosavedRef = useRef<string>("");
  const autosaveTimerRef = useRef<number | null>(null);
  const isBatchHistoryEntry = useCallback((entry: { bounding_boxes: Json | null }) => {
    const bb = entry.bounding_boxes;
    return (
      bb &&
      typeof bb === "object" &&
      !Array.isArray(bb) &&
      (bb as { batch?: boolean }).batch === true
    );
  }, []);

  const autosaveClearTimerRef = useRef<number | null>(null);
  const [autosaveUi, setAutosaveUi] = useState<
    | { state: "idle" }
    | { state: "pending" }
    | { state: "saving" }
    | { state: "saved" }
    | { state: "error" }
  >({ state: "idle" });

  const clearAutosaveUiLater = useCallback((ms: number) => {
    if (autosaveClearTimerRef.current) {
      window.clearTimeout(autosaveClearTimerRef.current);
    }
    autosaveClearTimerRef.current = window.setTimeout(() => {
      setAutosaveUi({ state: "idle" });
      autosaveClearTimerRef.current = null;
    }, ms);
  }, []);

  const { editor, turndown } = useOcrMarkdownEditor(markdownText, {
    onMarkdownChange: setMarkdownText,
    debounceMs: 250,
  });

  const { copied, copy, download, exportPdf, downloadDocx } =
    useSingleImageExportActions({
      activeTab,
      editor,
      turndown,
      markdownText,
      jsonText,
      imageUrl,
      sourceImageName: imageFile.name,
    });

  const handleMarkdownHighlightChange = useCallback(
    (indices: number[] | null) => {
      setMarkdownLinkedBoxIndices(indices);
    },
    [],
  );

  useEffect(() => {
    setMarkdownLinkedBoxIndices(null);
  }, [boundingBoxes]);

  useEffect(() => {
    if (activeTab !== "markdown") setMarkdownLinkedBoxIndices(null);
  }, [activeTab]);

  useEffect(() => {
    setPhase("edit");
    setEditFile(imageFile);
    setEnhance(false);
    resetWorkspaceUi();
    setMarkdownText("");
    setJsonText("");
    setBoundingBoxes([]);
  }, [imageFile, resetWorkspaceUi, setBoundingBoxes, setJsonText, setMarkdownText]);

  useEffect(() => {
    // Chỉ trong OCR workspace: chặn scrollbar ở cấp html/body để tránh "scroll ngoài".
    document.documentElement.classList.add("ocr-workspace");
    document.body.classList.add("ocr-workspace");
    return () => {
      document.documentElement.classList.remove("ocr-workspace");
      document.body.classList.remove("ocr-workspace");
    };
  }, []);

  useEffect(() => {
    return () => {
      if (lastOcrBlobUrlRef.current) {
        URL.revokeObjectURL(lastOcrBlobUrlRef.current);
        lastOcrBlobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Auto-save editor changes to Supabase ocr_history (debounced).
    // Only for result phase and when we know which history row is currently open.
    if (phase !== "result") return;
    if (!currentHistoryId) return;
    if (!user?.id) return;

    const next = markdownText.trim();
    if (!next) return;
    if (next === lastAutosavedRef.current) return;

    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    setAutosaveUi({ state: "pending" });
    autosaveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          setAutosaveUi({ state: "saving" });
          const { error } = await supabase
            .from("ocr_history")
            .update({ extracted_text: next })
            .eq("id", currentHistoryId);
          if (error) throw error;

          lastAutosavedRef.current = next;
          setAutosaveUi({ state: "saved" });
          clearAutosaveUiLater(1200);

          // Update history caches immediately (avoid waiting for refetch).
          const queries = qc.getQueriesData({ queryKey: ["ocr_history"] });
          for (const [key, data] of queries) {
            if (!Array.isArray(data)) continue;
            qc.setQueryData(
              key,
              (data as Array<Record<string, unknown>>).map((row) =>
                row?.id === currentHistoryId ? { ...row, extracted_text: next } : row,
              ),
            );
          }
        } catch (e) {
          console.error("[ocr-history] autosave failed:", e);
          setAutosaveUi({ state: "error" });
          clearAutosaveUiLater(2500);
        }
      })();
    }, 1000);

    return () => {
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    };
  }, [
    clearAutosaveUiLater,
    currentHistoryId,
    markdownText,
    phase,
    qc,
    user?.id,
  ]);

  useEffect(() => {
    return () => {
      if (autosaveClearTimerRef.current) {
        window.clearTimeout(autosaveClearTimerRef.current);
        autosaveClearTimerRef.current = null;
      }
    };
  }, []);

  const setOcrImageFromFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    if (lastOcrBlobUrlRef.current)
      URL.revokeObjectURL(lastOcrBlobUrlRef.current);
    lastOcrBlobUrlRef.current = url;
    setImageUrl(url);
  }, []);

  const {
    canUse: quotaCanUse,
    remaining: quotaRemaining,
    isUnlimited: quotaUnlimited,
    loading: quotaLoading,
    refresh: refreshQuota,
    deductCredit,
  } = useOcrQuota();

  const startOcr = useCallback(async () => {
    if (phase === "processing") return;
    if (!editFile) return;
    if (!quotaCanUse) {
      if (!user) {
        toast.error("Vui lòng đăng nhập để sử dụng OCR.", {
          action: {
            label: "Đăng nhập",
            onClick: () => {
              window.location.href = "/auth";
            },
          },
          duration: 8000,
        });
      } else {
        toast.error(
          "Bạn đã hết lượt OCR miễn phí hôm nay. Nâng cấp Pro để không giới hạn.",
          {
            action: {
              label: "Nâng cấp",
              onClick: () => (window.location.href = "/profile?tab=pricing"),
            },
            duration: 8000,
          },
        );
      }
      return;
    }

    try {
      clearCancelRequest();
      let fileForOcr = editFile;

      try {
        if (cropperApiRef.current) {
          const blob = await cropperApiRef.current.exportCroppedBlob();
          const type = blob.type || editFile.type || "image/png";
          fileForOcr = new File([blob], `${editFile.name}_cropped.png`, {
            type,
          });
        }

        if (isCancelRequested()) {
          setPhase("edit");
          clearOcrLoadingUi();
          return;
        }

        if (enhance) {
          fileForOcr = await enhanceFile(fileForOcr, {
            contrast: 1.28,
            brightness: 1.03,
            sharpenPass: 1,
          });
        }

        if (isCancelRequested()) {
          setPhase("edit");
          clearOcrLoadingUi();
          return;
        }
      } catch {
        toast.error("Không thể xuất ảnh đã crop. Vui lòng thử lại.");
        setPhase("edit");
        clearOcrLoadingUi();
        return;
      }

      // After we captured the crop, we can safely transition UI/layout.
      // Freeze crop view for the next layout tick (prevents tiny crop-box shifts
      // when phase/toolbar/history changes cause Cropper reflow).
      cropperApiRef.current?.freezeView();
      setShowHistory(false);
      setActiveTab("markdown");
      setPhase("processing");
      setOcrLoadingUi("Đang chuẩn bị ảnh...", 5);

      setOcrImageFromFile(fileForOcr);
      const ok = await runOcrOnFile(fileForOcr);
      if (isCancelRequested()) {
        setPhase("edit");
        return;
      }
      setPhase(ok ? "result" : "edit");
      if (ok) {
        // Deduct from daily free uses or credits
        await deductCredit();
        refreshQuota();
      }
    } finally {
      clearCancelRequest();
    }
  }, [
    clearCancelRequest,
    clearOcrLoadingUi,
    deductCredit,
    editFile,
    enhance,
    isCancelRequested,
    phase,
    quotaCanUse,
    refreshQuota,
    runOcrOnFile,
    setActiveTab,
    setShowHistory,
    user,
    setOcrImageFromFile,
    setOcrLoadingUi,
  ]);

  const applyRotate = useCallback(
    async (angleDegrees: number) => {
      if (phase === "processing" || isEditingBusy) return;
      setIsEditingBusy(true);
      try {
        cropperApiRef.current?.rotate(angleDegrees);
      } catch {
        toast.error("Lỗi khi xoay ảnh. Vui lòng thử lại.");
      } finally {
        setIsEditingBusy(false);
      }
    },
    [isEditingBusy, phase],
  );

  const applyEnhance = useCallback(async () => {
    if (phase === "processing" || isEditingBusy) return;
    setEnhance((v) => !v);
  }, [isEditingBusy, phase]);

  const handleReprocess = useCallback(() => {
    if (phase === "result") {
      setPhase("edit");
      setShowHistory(false);
      setMarkdownText("");
      setJsonText("");
      setBoundingBoxes([]);
      setActiveTab("markdown");
      setEnhance(false);
      cropperApiRef.current?.resetAll();
      setCurrentHistoryId(null);
      return;
    }
    void startOcr();
  }, [
    phase,
    setActiveTab,
    setBoundingBoxes,
    setJsonText,
    setMarkdownText,
    setShowHistory,
    startOcr,
    setCurrentHistoryId,
  ]);

  const handleToggleHistory = useCallback(() => {
    toggleHistoryOpen();
  }, [toggleHistoryOpen]);

  const handleHistorySelect = useCallback(
    (entry: OcrHistoryEntry) => {
      // Don't allow history selection while OCR is loading
      if (phase === "loading") {
        toast.error("Vui lòng chờ OCR hoàn thành trước khi chuyển lịch sử", {
          duration: 3000,
        });
        return;
      }

      // If user selects a batch history entry while in single-image workspace,
      // switch to the batch workspace (AppPage will hydrate it).
      if (isBatchHistoryEntry(entry)) {
        if (onRequestOpenHistory) {
          onRequestOpenHistory(entry);
        } else {
          // Fallback for callers that don't provide a handler (e.g. LandingPage):
          // deep-link to /app so AppPage can hydrate either single or batch entries.
          window.location.href = `/app?historyId=${encodeURIComponent(entry.id)}`;
        }
        return;
      }

      setPhase("result");
      setEnhance(false);
      setCurrentHistoryId(entry.id);

      if (lastOcrBlobUrlRef.current) {
        URL.revokeObjectURL(lastOcrBlobUrlRef.current);
        lastOcrBlobUrlRef.current = null;
      }

      // entry is guaranteed non-batch here (handled above)

      const blocks: BoundingBox[] = Array.isArray(entry.bounding_boxes)
        ? (entry.bounding_boxes as unknown as BoundingBox[])
        : [];
      const normalizedBlocks = normalizeBoundingBoxes(blocks);
      let mdOut = entry.extracted_text || "";

      // If history already stores the final post-processed HTML/markdown, don't redo work.
      const looksPostProcessed =
        mdOut.includes("data-ocr-fontsize") ||
        mdOut.includes("data-font-size-px") ||
        mdOut.includes("data-font-family") ||
        mdOut.trim().startsWith("<p");

      if (!looksPostProcessed) {
        if (normalizedBlocks.length > 0) {
          mdOut = applyStyledHeaderFromBlocks({
            markdown: mdOut,
            blocks: normalizedBlocks,
          });
        }
        mdOut = formatTopSplitHeaderAsTable(mdOut);
        if (mdOut.trim().startsWith("<") && normalizedBlocks.length > 0) {
          mdOut = applyOcrFontSizesToHtml(mdOut, normalizedBlocks);
          mdOut = applyOcrFontFamiliesToHtml(mdOut, normalizedBlocks);
        }
      }
      setMarkdownText(mdOut);
      setBoundingBoxes(normalizedBlocks);
      setJsonText(
        JSON.stringify(
          {
            markdown: mdOut,
            full_text: "",
            blocks: normalizedBlocks,
          },
          null,
          2,
        ),
      );
      if (entry.image_data) {
        setImageUrl(entry.image_data);
        // Convert data URL to File object synchronously to avoid flicker
        // Data URL format: data:image/png;base64,... or data:image/jpeg;base64,...
        if (entry.image_data.startsWith("data:")) {
          try {
            const [header, data] = entry.image_data.split(",");
            const mimeMatch = header.match(/data:([^;]+)/);
            const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
            const binaryString = atob(data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: mimeType });
            setEditFile(
              new File([blob], entry.image_name || "ocr-history.png", {
                type: mimeType,
              }),
            );
          } catch {
            // Fallback: fetch if sync conversion fails
            void (async () => {
              try {
                const res = await fetch(entry.image_data!);
                const blob = await res.blob();
                const type = blob.type || "image/png";
                setEditFile(
                  new File([blob], entry.image_name || "ocr-history.png", {
                    type,
                  }),
                );
              } catch {
                // ignore
              }
            })();
          }
        } else {
          // For non-data URLs, fetch asynchronously
          void (async () => {
            try {
              const res = await fetch(entry.image_data!);
              const blob = await res.blob();
              const type = blob.type || "image/png";
              setEditFile(
                new File([blob], entry.image_name || "ocr-history.png", {
                  type,
                }),
              );
            } catch {
              // ignore
            }
          })();
        }
      }
    },
    [isBatchHistoryEntry, onRequestOpenHistory, setBoundingBoxes, setCurrentHistoryId, setJsonText, setMarkdownText, phase],
  );

  useEffect(() => {
    if (initialHistoryEntry) {
      handleHistorySelect(initialHistoryEntry);
    }
  }, [handleHistorySelect, initialHistoryEntry]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <OCRToolbar
        fileName={imageFile.name}
        isProcessing={ocrPipelineBusy}
        loadingLabel={loadingLabel || (ocrPipelineBusy ? "Đang xử lý…" : "")}
        hasText={Boolean(markdownText || jsonText)}
        copied={copied}
        onBack={onBack}
        onReprocess={handleReprocess}
        onPickAnother={onBack}
        onToggleHistory={handleToggleHistory}
        onCopy={copy}
        onDownloadMarkdown={() => download("markdown")}
        onDownloadJson={() => download("json")}
        onExportPdf={exportPdf}
        onDownloadDocx={downloadDocx}
        showReprocess={phase === "result"}
        onCancelProcessing={ocrPipelineBusy ? cancelProcessing : undefined}
        onSwitchToBatch={onSwitchToBatch ? () => onSwitchToBatch(imageFile) : undefined}
      />
      {/* Fixed-height status area to avoid layout shifts (Cropper/ImageViewer glitches) */}
      <div className="border-b border-border bg-card px-4 py-1.5 min-h-[40px] flex items-center">
        {lastError ? (
          <Alert
            variant="destructive"
            className="w-full flex items-start justify-between gap-3"
          >
            <div className="min-w-0">
              <AlertTitle>Lỗi OCR</AlertTitle>
              <AlertDescription>
                <p className="break-words">{lastError}</p>
              </AlertDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setLastError(null)}
              aria-label="Đóng thông báo lỗi"
              title="Đóng"
            >
              <X className="h-4 w-4" />
            </Button>
          </Alert>
        ) : ocrPipelineBusy ? (
          <div className="w-full">
            <Progress value={loadingProgress} className="h-2" />
          </div>
        ) : autosaveUi.state !== "idle" ? (
          <div className="flex w-full items-center justify-end gap-2 text-[11px] text-muted-foreground">
            {(autosaveUi.state === "pending" ||
              autosaveUi.state === "saving") && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Đang tự động lưu…</span>
              </>
            )}
            {autosaveUi.state === "saved" && <span>Đã lưu</span>}
            {autosaveUi.state === "error" && (
              <span className="text-destructive">Lưu thất bại</span>
            )}
          </div>
        ) : (
          <div className="w-full" />
        )}
      </div>

      {phase === "result" ? (
        <>
          <SingleImageResultPhase
            imageUrl={imageUrl}
            boundingBoxes={boundingBoxes}
            isProcessing={isProcessing}
            markdownLinkedBoxIndices={markdownLinkedBoxIndices}
            onMarkdownHighlightChange={handleMarkdownHighlightChange}
            activeTab={activeTab === "json" ? "json" : "markdown"}
            onActiveTabChange={(t) => setActiveTab(t)}
            editor={editor}
            jsonText={jsonText}
            onJsonTextChange={setJsonText}
            showHistory={showHistory}
            isLg={isLg}
            onHistorySelect={handleHistorySelect}
            historyRefresh={historyRefresh}
            activeHistoryId={currentHistoryId}
          />
          <OcrHistoryMobileDrawer
            open={showHistory && !isLg}
            onClose={() => setShowHistory(false)}
            onSelect={handleHistorySelect}
            refreshKey={historyRefresh}
          />
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <SingleImageEditPhase
              editImageUrl={editImageUrl}
              ocrPipelineBusy={ocrPipelineBusy}
              isEditingBusy={isEditingBusy}
              enhance={enhance}
              cropperApiRef={cropperApiRef}
              onCropperApiReady={(api) => {
                cropperApiRef.current = api;
              }}
              onRotate={(deg) => void applyRotate(deg)}
              onToggleEnhance={() => void applyEnhance()}
              onResetImage={() => {
                setEditFile(imageFile);
                setEnhance(false);
                cropperApiRef.current?.resetAll();
              }}
              onStartOcr={() => void startOcr()}
              quotaRemaining={quotaRemaining}
              quotaUnlimited={quotaUnlimited}
            />
          </div>

          {showHistory && isLg ? (
            <HistorySidebar
              isOpen={true}
              onSelect={handleHistorySelect}
              refreshKey={historyRefresh}
              activeEntryId={currentHistoryId}
            />
          ) : null}
        </div>
      )}

      <OcrHistoryMobileDrawer
        open={showHistory && !isLg && phase !== "result"}
        onClose={() => setShowHistory(false)}
        onSelect={handleHistorySelect}
        refreshKey={historyRefresh}
        activeEntryId={currentHistoryId}
      />
    </div>
  );
};

export default OCRWorkspace;
