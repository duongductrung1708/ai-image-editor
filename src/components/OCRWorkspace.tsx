import { useState, useCallback, useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";
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
import { enhanceFile } from "@/lib/imageProcessing";

interface OCRWorkspaceProps {
  imageFile: File;
  onBack: () => void;
}

const OCRWorkspace = ({ imageFile, onBack }: OCRWorkspaceProps) => {
  const { user } = useAuth();
  const [imageUrl, setImageUrl] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<"markdown" | "json" | "tables">(
    "markdown",
  );
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
    runOcrOnFile,
    cancelProcessing,
    clearCancelRequest,
    isCancelRequested,
    setOcrLoadingUi,
    clearOcrLoadingUi,
  } = useSingleImageOcr();

  const { editor, turndown } = useOcrMarkdownEditor(markdownText);

  const { copied, copy, download, exportPdf, downloadDocx } = useSingleImageExportActions({
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
    setShowHistory(false);
    setActiveTab("markdown");
    setMarkdownText("");
    setJsonText("");
    setBoundingBoxes([]);
  }, [imageFile, setBoundingBoxes, setJsonText, setMarkdownText]);

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

  const setOcrImageFromFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    if (lastOcrBlobUrlRef.current)
      URL.revokeObjectURL(lastOcrBlobUrlRef.current);
    lastOcrBlobUrlRef.current = url;
    setImageUrl(url);
  }, []);

  const { canUse: quotaCanUse, remaining: quotaRemaining, isUnlimited: quotaUnlimited, refresh: refreshQuota } = useOcrQuota();

  const startOcr = useCallback(async () => {
    if (phase === "processing") return;
    if (!editFile) return;
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

    try {
      setShowHistory(false);
      setActiveTab("markdown");
      clearCancelRequest();
      setPhase("processing");
      setOcrLoadingUi("Đang chuẩn bị ảnh...", 5);

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

      setOcrImageFromFile(fileForOcr);
      const ok = await runOcrOnFile(fileForOcr);
      if (isCancelRequested()) {
        setPhase("edit");
        return;
      }
      setPhase(ok ? "result" : "edit");
      if (ok) refreshQuota();
    } finally {
      clearCancelRequest();
    }
  }, [
    clearCancelRequest,
    clearOcrLoadingUi,
    editFile,
    enhance,
    isCancelRequested,
    phase,
    quotaCanUse,
    refreshQuota,
    runOcrOnFile,
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
      cropperApiRef.current?.reset();
      return;
    }
    void startOcr();
  }, [phase, startOcr, setBoundingBoxes, setJsonText, setMarkdownText]);

  const toggleHistory = useCallback(() => {
    setShowHistory((v) => !v);
  }, []);

  const handleHistorySelect = useCallback(
    (entry: {
      id: string;
      image_name: string;
      extracted_text: string;
      bounding_boxes: Json | null;
      image_data: string | null;
      created_at: string;
    }) => {
      setPhase("result");
      setEnhance(false);

      if (lastOcrBlobUrlRef.current) {
        URL.revokeObjectURL(lastOcrBlobUrlRef.current);
        lastOcrBlobUrlRef.current = null;
      }

      const bbRaw = entry.bounding_boxes;
      if (
        bbRaw &&
        typeof bbRaw === "object" &&
        !Array.isArray(bbRaw) &&
        (bbRaw as { batch?: boolean }).batch === true
      ) {
        toast.info(
          "Bản ghi OCR hàng loạt: hiển thị văn bản gộp; ảnh/bbox chỉ tương ứng trang đầu nếu có.",
        );
        setMarkdownText(entry.extracted_text);
        setBoundingBoxes([]);
        setJsonText(JSON.stringify(bbRaw, null, 2));
        if (entry.image_data) {
          setImageUrl(entry.image_data);
          if (entry.image_data.startsWith("data:")) {
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
          setImageUrl("");
        }
        return;
      }

      const blocks: BoundingBox[] = Array.isArray(entry.bounding_boxes)
        ? (entry.bounding_boxes as unknown as BoundingBox[])
        : [];
      setMarkdownText(entry.extracted_text);
      setBoundingBoxes(blocks);
      setJsonText(
        JSON.stringify(
          {
            markdown: entry.extracted_text,
            full_text: "",
            blocks,
          },
          null,
          2,
        ),
      );
      if (entry.image_data) {
        setImageUrl(entry.image_data);
        if (entry.image_data.startsWith("data:")) {
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
    [setBoundingBoxes, setJsonText, setMarkdownText],
  );

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
        onToggleHistory={toggleHistory}
        onCopy={copy}
        onDownloadMarkdown={() => download("markdown")}
        onDownloadJson={() => download("json")}
        onExportPdf={exportPdf}
        onDownloadDocx={downloadDocx}
        showReprocess={phase === "result"}
        onCancelProcessing={ocrPipelineBusy ? cancelProcessing : undefined}
      />
      {ocrPipelineBusy && (
        <div className="border-b border-border bg-card px-4 py-2">
          <Progress value={loadingProgress} className="h-2" />
        </div>
      )}

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
          />
          <OcrHistoryMobileDrawer
            open={showHistory && !isLg}
            onClose={() => setShowHistory(false)}
            onSelect={handleHistorySelect}
            refreshKey={historyRefresh}
          />
        </>
      ) : (
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
            cropperApiRef.current?.reset();
          }}
          onStartOcr={() => void startOcr()}
          quotaRemaining={quotaRemaining}
          quotaUnlimited={quotaUnlimited}
        />
      )}

      {showHistory && isLg && phase !== "result" ? (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowHistory(false)}>
          <div
            className="absolute right-0 top-0 h-full"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <HistorySidebar
              isOpen={true}
              onSelect={handleHistorySelect}
              refreshKey={historyRefresh}
            />
          </div>
        </div>
      ) : null}

      <OcrHistoryMobileDrawer
        open={showHistory && !isLg && phase !== "result"}
        onClose={() => setShowHistory(false)}
        onSelect={handleHistorySelect}
        refreshKey={historyRefresh}
      />
    </div>
  );
};

export default OCRWorkspace;
