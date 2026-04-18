import { useCallback, useEffect, useState } from "react";
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
}

const BatchOCRWorkspace = ({
  files,
  onBack,
  onPickAnother,
  initialHistoryEntry = null,
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
  const [linkedBatchHighlight, setLinkedBatchHighlight] = useState<{
    pageIndex: number;
    indices: number[];
  } | null>(null);

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
    applyHistoryEntry,
  } = useBatchOcr(files);

  useEffect(() => {
    if (!initialHistoryEntry) return;
    setActiveHistoryId(initialHistoryEntry.id);
    applyHistoryEntry(initialHistoryEntry);
  }, [applyHistoryEntry, initialHistoryEntry]);

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
  }, [runBatch, refreshQuota, deductDailyFreeUsesUpTo, user, freeDailyRemaining, balance, files]);

  const handleToolbarReprocess = useCallback(() => {
    if (phase === "result") guardedRunBatch();
  }, [phase, guardedRunBatch]);

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
        isProcessing={phase === "processing"}
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
        showReprocess={phase === "result"}
        showPdf={phase === "result"}
        onCancelProcessing={phase === "processing" ? cancelBatch : undefined}
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
          files={files}
          sourcePreviewUrls={effectivePreviewUrls}
          showHistorySidebar={showHistory}
          isLg={isLg}
          onHistorySelect={(entry) => {
            setActiveHistoryId(entry.id);
            applyHistoryEntry(entry);
          }}
          historyRefresh={historyRefresh}
        />
      )}

      {phase === "ready" && (
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <BatchReadyView
              files={files}
              sourcePreviewUrls={effectivePreviewUrls}
              totalBytes={totalBytes}
              extensionSummary={extensionSummary}
              isProcessing={isProcessing}
              onStartBatch={guardedRunBatch}
              quotaRemaining={quotaRemaining}
              quotaUnlimited={quotaUnlimited}
            />
          </div>

          {showHistory && isLg ? (
            <HistorySidebar
              isOpen={true}
              onSelect={(entry) => {
                setActiveHistoryId(entry.id);
                applyHistoryEntry(entry);
              }}
              refreshKey={historyRefresh}
              activeEntryId={activeHistoryId}
            />
          ) : null}
        </div>
      )}

      {phase === "result" && (
        <BatchResultView
          files={files}
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
            setActiveHistoryId(entry.id);
            applyHistoryEntry(entry);
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
        onSelect={(entry) => {
          setActiveHistoryId(entry.id);
          applyHistoryEntry(entry);
        }}
        refreshKey={historyRefresh}
        activeEntryId={activeHistoryId}
      />

      {/* Desktop (ready): history is rendered inline next to workspace above */}
    </div>
  );
};

export default BatchOCRWorkspace;
