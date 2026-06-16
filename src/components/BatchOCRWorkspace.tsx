import { useCallback, useEffect, useMemo, useState } from "react";
import type { OcrHistoryEntry } from "@/components/ocr/OcrHistoryMobileDrawer";
import OCRToolbar from "@/components/ocr/OCRToolbar";
import OcrHistoryMobileDrawer from "@/components/ocr/OcrHistoryMobileDrawer";
import BatchProcessingView from "@/components/batch/BatchProcessingView";
import BatchReadyView from "@/components/batch/BatchReadyView";
import BatchResultView from "@/components/batch/BatchResultView";
import HistorySidebar from "@/components/HistorySidebar";
import { useIsLgScreen } from "@/hooks/useMediaQueryMinWidth";
import { useOcrMarkdownEditor } from "@/hooks/useOcrMarkdownEditor";
import { useBatchOcr } from "@/hooks/useBatchOcr";
import { useOcrBatchExportActions } from "@/hooks/useOcrBatchExportActions";
import { useOcrQuota } from "@/hooks/useOcrQuota";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface BatchOCRWorkspaceProps {
  files: File[];
  onBack: () => void;
  onPickAnother: () => void;
  initialHistoryEntry?: import("@/components/ocr/OcrHistoryMobileDrawer").OcrHistoryEntry | null;
  onRequestOpenHistory?: (entry: OcrHistoryEntry) => void;
}

const BatchOCRWorkspace = ({
  files,
  onBack,
  onPickAnother,
  initialHistoryEntry = null,
  onRequestOpenHistory,
}: BatchOCRWorkspaceProps) => {
  const { user } = useAuth();
  const isLg = useIsLgScreen();
  const showHistory = useWorkspaceStore((s) => s.showHistory);
  const setShowHistory = useWorkspaceStore((s) => s.setShowHistory);
  const toggleHistoryOpen = useWorkspaceStore((s) => s.toggleHistory);
  const batchActiveTab = useWorkspaceStore((s) => s.batchActiveTab);
  const setBatchActiveTab = useWorkspaceStore((s) => s.setBatchActiveTab);
  const resetWorkspaceUi = useWorkspaceStore((s) => s.reset);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const isBatchHistoryEntry = useCallback((entry: { bounding_boxes: unknown }) => {
    const bb = entry.bounding_boxes;
    return (
      bb &&
      typeof bb === "object" &&
      !Array.isArray(bb) &&
      (bb as { batch?: boolean }).batch === true
    );
  }, []);
  const [linkedBatchHighlight, setLinkedBatchHighlight] = useState<{
    pageIndex: number;
    indices: number[];
  } | null>(null);
  const [orderedFileIndices, setOrderedFileIndices] = useState<number[]>(
    files.map((_, i) => i),
  );
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const orderedFiles = useMemo(() => {
    if (
      orderedFileIndices.length !== files.length ||
      !orderedFileIndices.every((i) => i >= 0 && i < files.length)
    ) {
      return files;
    }
    return orderedFileIndices.map((idx) => files[idx]);
  }, [files, orderedFileIndices]);

  const {
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
    returnToBatchReady,
    applyHistoryEntry,
  } = useBatchOcr(orderedFiles);

  const selectHistory = useCallback(
    (entry: import("@/components/ocr/OcrHistoryMobileDrawer").OcrHistoryEntry) => {
      setActiveHistoryId(entry.id);
      if (!isBatchHistoryEntry(entry)) {
        if (onRequestOpenHistory) {
          onRequestOpenHistory(entry);
        } else {
          // Fallback for callers that don't provide a handler (e.g. LandingPage):
          // deep-link to /app so AppPage can hydrate either single or batch entries.
          window.location.href = `/app?historyId=${encodeURIComponent(entry.id)}`;
        }
        return;
      }
      applyHistoryEntry(entry);
    },
    [applyHistoryEntry, isBatchHistoryEntry, onRequestOpenHistory],
  );

  useEffect(() => {
    if (!initialHistoryEntry) return;
    setActiveHistoryId(initialHistoryEntry.id);
    if (isBatchHistoryEntry(initialHistoryEntry)) {
      applyHistoryEntry(initialHistoryEntry);
    } else {
      onRequestOpenHistory?.(initialHistoryEntry);
    }
  }, [applyHistoryEntry, initialHistoryEntry, isBatchHistoryEntry, onRequestOpenHistory]);

  useEffect(() => {
    setOrderedFileIndices(files.map((_, i) => i));
  }, [files]);

  const { editor, turndown } = useOcrMarkdownEditor(markdownText, {
    onMarkdownChange: setMarkdownText,
    debounceMs: 250,
  });

  const {
    copied,
    copy,
    downloadMarkdown,
    downloadJson,
    downloadDocx,
    exportPdf,
  } = useOcrBatchExportActions({
    activeTab,
    editor,
    turndown,
    markdownText,
    jsonText,
  });

  const handleToggleHistory = useCallback(() => {
    toggleHistoryOpen();
  }, [toggleHistoryOpen]);

  const handleBatchMarkdownHighlightChange = useCallback(
    (payload: { pageIndex: number; indices: number[] } | null) => {
      setLinkedBatchHighlight(payload);
    },
    [],
  );

  const {
    remaining: quotaRemaining,
    isUnlimited: quotaUnlimited,
    loading: quotaLoading,
    refresh: refreshQuota,
    deductDailyFreeUsesUpTo,
    balance,
    freeDailyRemaining,
  } = useOcrQuota();

  useEffect(() => {
    setLinkedBatchHighlight(null);
  }, [markdownText, batchPages]);

  useEffect(() => {
    // Keep query/store tab as source of truth for the hook-controlled tab.
    setActiveTab(batchActiveTab);
  }, [batchActiveTab, setActiveTab]);

  useEffect(() => {
    document.documentElement.classList.add("ocr-workspace");
    document.body.classList.add("ocr-workspace");
    return () => {
      document.documentElement.classList.remove("ocr-workspace");
      document.body.classList.remove("ocr-workspace");
    };
  }, []);

  useEffect(() => {
    // New batch workspace instance: reset shared workspace UI.
    resetWorkspaceUi();
  }, [resetWorkspaceUi]);

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (dropIndex: number) => {
      if (draggedIndex === null || draggedIndex === dropIndex) {
        setDraggedIndex(null);
        return;
      }

      const newIndices = [...orderedFileIndices];
      const draggedOriginalIndex = newIndices[draggedIndex];
      
      // Remove dragged item
      newIndices.splice(draggedIndex, 1);
      // Insert at new position
      newIndices.splice(dropIndex, 0, draggedOriginalIndex);
      
      setOrderedFileIndices(newIndices);
      setDraggedIndex(null);
    },
    [draggedIndex, orderedFileIndices],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  const guardedRunBatch = useCallback(() => {
    // Check if user has enough quota for ALL files in the batch
    const totalQuotaNeeded = files.length;
    const availableQuota = freeDailyRemaining + (balance > 0 ? balance : 0);
    const hasEnoughQuota = availableQuota >= totalQuotaNeeded;

    if (!hasEnoughQuota) {
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
          `Không đủ lượt OCR cho ${totalQuotaNeeded} ảnh. Bạn có ${freeDailyRemaining} lượt miễn phí${balance > 0 ? ` và ${balance} credits` : ""}.`,
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

    void runBatch().then(async (okCount) => {
      // Sync daily free uses with successful pages. `runBatch` resolves before React re-renders, so we must
      // use the returned `okCount` — not `lastBatchMeta` from closure (it would still be stale/null).
      // Credits for paid slots are charged in the Edge Function; only `deduct_daily_use` belongs here.
      const n = typeof okCount === "number" ? okCount : 0;
      if (n > 0) await deductDailyFreeUsesUpTo(n);
      refreshQuota();
    });
  }, [runBatch, refreshQuota, deductDailyFreeUsesUpTo, user, freeDailyRemaining, balance, files.length]);

  const handleToolbarReprocess = useCallback(() => {
    if (phase === "result") {
      returnToBatchReady();
      return;
    }
    if (phase === "ready") guardedRunBatch();
  }, [phase, guardedRunBatch, returnToBatchReady]);

  const toolbarTitle =
    phase === "result"
      ? `Hàng loạt · ${pageCount} ảnh${
          lastBatchMeta
            ? ` · ${lastBatchMeta.okCount}/${pageCount} OK${
                lastBatchMeta.concurrency
                  ? ` · ${lastBatchMeta.concurrency} luồng`
                  : ""
              }`
            : ""
        }`
      : `Hàng loạt · ${files.length} ảnh`;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background overflow-hidden">
      <OCRToolbar
        fileName={toolbarTitle}
        isProcessing={isProcessing || phase === "processing"}
        loadingLabel="OCR hàng loạt trên máy chủ…"
        hasText={Boolean(markdownText || jsonText)}
        copied={copied}
        onBack={onBack}
        onReprocess={handleToolbarReprocess}
        onPickAnother={onPickAnother}
        onToggleHistory={handleToggleHistory}
        onCopy={copy}
        onDownloadMarkdown={downloadMarkdown}
        onDownloadJson={downloadJson}
        onExportPdf={exportPdf}
        onDownloadDocx={() => void downloadDocx()}
        showReprocess={phase === "result" || phase === "ready"}
        showPdf={phase === "result"}
        onCancelProcessing={
          isProcessing || phase === "processing" ? cancelBatch : undefined
        }
      />
      {/* Fixed-height status area to avoid layout shifts */}
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
        ) : (
          <div className="w-full" />
        )}
      </div>

      {phase === "processing" && (
        <BatchProcessingView
          files={orderedFiles}
          sourcePreviewUrls={effectivePreviewUrls}
          showHistorySidebar={showHistory}
          isLg={isLg}
          onHistorySelect={(entry) => {
            selectHistory(entry);
          }}
          historyRefresh={historyRefresh}
          activeHistoryId={activeHistoryId}
        />
      )}

      {phase === "ready" && (
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
            <BatchReadyView
              files={orderedFiles}
              sourcePreviewUrls={sourcePreviewUrls}
              totalBytes={totalBytes}
              extensionSummary={extensionSummary}
              isProcessing={isProcessing}
              onStartBatch={guardedRunBatch}
              quotaRemaining={quotaRemaining}
              quotaUnlimited={quotaUnlimited}
              draggedIndex={draggedIndex}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          </div>

          {showHistory && isLg ? (
            <HistorySidebar
              isOpen={true}
              onSelect={selectHistory}
              refreshKey={historyRefresh}
              activeEntryId={activeHistoryId}
            />
          ) : null}
        </div>
      )}

      {phase === "result" && (
        <BatchResultView
          files={orderedFiles}
          batchPages={batchPages}
          effectivePreviewUrls={effectivePreviewUrls}
          pageCount={pageCount}
          restoredFromHistory={restoredFromHistory}
          linkedBatchHighlight={linkedBatchHighlight}
          onBatchMarkdownHighlightChange={handleBatchMarkdownHighlightChange}
          activeTab={activeTab}
          onActiveTabChange={(t) => {
            setActiveTab(t);
            setBatchActiveTab(t);
          }}
          editor={editor}
          jsonText={jsonText}
          onJsonTextChange={setJsonText}
          totalBoxCount={totalBoxCount}
          showHistory={showHistory}
          isLg={isLg}
          onHistorySelect={(entry) => {
            selectHistory(entry);
          }}
          historyRefresh={historyRefresh}
          activeHistoryId={activeHistoryId}
        />
      )}

      <OcrHistoryMobileDrawer
        open={
          showHistory &&
          !isLg &&
          (phase === "ready" || phase === "processing" || phase === "result")
        }
        onClose={() => setShowHistory(false)}
        onSelect={selectHistory}
        refreshKey={historyRefresh}
        activeEntryId={activeHistoryId}
      />

      {/* Desktop (ready): history is rendered inline next to workspace above */}
    </div>
  );
};

export default BatchOCRWorkspace;
