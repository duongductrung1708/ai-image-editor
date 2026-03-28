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
  const [showHistory, setShowHistory] = useState(false);
  const [linkedBatchHighlight, setLinkedBatchHighlight] = useState<{
    pageIndex: number;
    indices: number[];
  } | null>(null);

  const {
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
  } = useBatchOcr(files);

  const { editor, turndown } = useOcrMarkdownEditor(markdownText);

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

  const toggleHistory = useCallback(() => {
    setShowHistory((v) => !v);
  }, []);

  const handleBatchMarkdownHighlightChange = useCallback(
    (payload: { pageIndex: number; indices: number[] } | null) => {
      setLinkedBatchHighlight(payload);
    },
    [],
  );

  const { canUse: quotaCanUse, remaining: quotaRemaining, refresh: refreshQuota } = useOcrQuota();

  useEffect(() => {
    setLinkedBatchHighlight(null);
  }, [markdownText, batchPages]);

  const guardedRunBatch = useCallback(() => {
    if (!quotaCanUse) {
      if (!user) {
        toast.error("Vui lòng đăng nhập để sử dụng OCR.", {
          action: { label: "Đăng nhập", onClick: () => { window.location.href = "/auth"; } },
          duration: 8000,
        });
      } else {
        toast.error("Bạn đã hết lượt OCR miễn phí hôm nay. Nâng cấp Pro để không giới hạn.", {
          action: { label: "Nâng cấp", onClick: () => window.location.href = "/profile?tab=pricing" },
          duration: 8000,
        });
      }
      return;
    }
    void runBatch().then(() => {
      refreshQuota();
    });
  }, [quotaCanUse, runBatch, refreshQuota, user]);

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
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <OCRToolbar
        fileName={toolbarTitle}
        isProcessing={phase === "processing"}
        loadingLabel="OCR hàng loạt trên máy chủ…"
        hasText={Boolean(markdownText || jsonText)}
        copied={copied}
        onBack={onBack}
        onReprocess={handleToolbarReprocess}
        onPickAnother={onPickAnother}
        onToggleHistory={toggleHistory}
        onCopy={copy}
        onDownloadMarkdown={downloadMarkdown}
        onDownloadJson={downloadJson}
        onExportPdf={exportPdf}
        onDownloadDocx={() => void downloadDocx()}
        showReprocess={phase === "result"}
        showPdf={phase === "result"}
        onCancelProcessing={phase === "processing" ? cancelBatch : undefined}
      />

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
        <BatchReadyView
          files={files}
          sourcePreviewUrls={sourcePreviewUrls}
          totalBytes={totalBytes}
          extensionSummary={extensionSummary}
          isProcessing={isProcessing}
          onStartBatch={guardedRunBatch}
          quotaRemaining={quotaRemaining}
          quotaUnlimited={!quotaCanUse ? false : quotaRemaining === Infinity}
        />
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
          onActiveTabChange={setActiveTab}
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

      {showHistory && isLg && phase === "ready" ? (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowHistory(false)}>
          <div
            className="absolute right-0 top-0 h-full"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <HistorySidebar
              isOpen={true}
              onSelect={applyHistoryEntry}
              refreshKey={historyRefresh}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default BatchOCRWorkspace;
