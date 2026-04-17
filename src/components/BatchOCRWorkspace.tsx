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
}

const BatchOCRWorkspace = ({
  files,
  onBack,
  onPickAnother,
}: BatchOCRWorkspaceProps) => {
  const { user } = useAuth();
  const isLg = useIsLgScreen();
  const showHistory = useWorkspaceStore((s) => s.showHistory);
  const setShowHistory = useWorkspaceStore((s) => s.setShowHistory);
  const toggleHistoryOpen = useWorkspaceStore((s) => s.toggleHistory);
  const batchActiveTab = useWorkspaceStore((s) => s.batchActiveTab);
  const setBatchActiveTab = useWorkspaceStore((s) => s.setBatchActiveTab);
  const resetWorkspaceUi = useWorkspaceStore((s) => s.reset);
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
    canUse: quotaCanUse,
    remaining: quotaRemaining,
    isUnlimited: quotaUnlimited,
    loading: quotaLoading,
    refresh: refreshQuota,
    deductCredit,
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
    void runBatch().then(() => {
      // For batch OCR: deduct the number of pages that were successfully OCR'd
      // We call deductCredit for each successfully processed page
      if (lastBatchMeta?.okCount) {
        for (let i = 0; i < lastBatchMeta.okCount; i++) {
          void deductCredit();
        }
      }
      refreshQuota();
    });
  }, [quotaCanUse, runBatch, refreshQuota, deductCredit, lastBatchMeta, user]);

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
          sourcePreviewUrls={sourcePreviewUrls}
          showHistorySidebar={showHistory}
          isLg={isLg}
          onHistorySelect={applyHistoryEntry}
          historyRefresh={historyRefresh}
        />
      )}

      {phase === "ready" && (
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <BatchReadyView
              files={files}
              sourcePreviewUrls={sourcePreviewUrls}
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
              onSelect={applyHistoryEntry}
              refreshKey={historyRefresh}
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
          onHistorySelect={applyHistoryEntry}
          historyRefresh={historyRefresh}
        />
      )}

      <OcrHistoryMobileDrawer
        open={
          showHistory &&
          !isLg &&
          (phase === "ready" || phase === "processing" || phase === "result")
        }
        onClose={() => setShowHistory(false)}
        onSelect={applyHistoryEntry}
        refreshKey={historyRefresh}
      />

      {/* Desktop (ready): history is rendered inline next to workspace above */}
    </div>
  );
};

export default BatchOCRWorkspace;
