import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExtension from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ImageViewer, { type BoundingBox } from "@/components/ImageViewer";
import HistorySidebar from "@/components/HistorySidebar";
import ImageCropper, { type ImageCropperApi } from "@/components/ocr/ImageCropper";
import { Crop, RotateCcw, RotateCw, Sparkles } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";
import {
  isOcrErrorResponse,
  isOcrSuccessResponse,
  type OcrApiResponse,
} from "@/types/ocr";
import OCRToolbar from "@/components/ocr/OCRToolbar";
import MarkdownEditor from "@/components/ocr/MarkdownEditor";
import JsonViewer from "@/components/ocr/JsonViewer";
import { enhanceFile } from "@/lib/imageProcessing";

interface OCRWorkspaceProps {
  imageFile: File;
  onBack: () => void;
}

const OCRWorkspace = ({ imageFile, onBack }: OCRWorkspaceProps) => {
  const [imageUrl, setImageUrl] = useState("");
  const [markdownText, setMarkdownText] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string>("");
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState<"markdown" | "json" | "tables">(
    "markdown",
  );
  const [isLg, setIsLg] = useState(false);

  const [phase, setPhase] = useState<"edit" | "processing" | "result">("edit");
  const [editFile, setEditFile] = useState<File>(imageFile);
  const [editImageUrl, setEditImageUrl] = useState<string>("");
  const [enhance, setEnhance] = useState(false);
  const [isEditingBusy, setIsEditingBusy] = useState(false);

  const lastOcrBlobUrlRef = useRef<string | null>(null);
  const cropperApiRef = useRef<ImageCropperApi | null>(null);

  marked.setOptions({ gfm: true, breaks: true });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsLg(mq.matches);
    update();

    // Back-compat for older browsers
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }

    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  const turndown = useMemo(() => {
    const td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    td.use(gfm);
    return td;
  }, []);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      UnderlineExtension,
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: markdownText ? (marked.parse(markdownText) as string) : "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-full text-foreground focus:outline-none font-body",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextHtml = markdownText ? (marked.parse(markdownText) as string) : "";
    editor.commands.setContent(nextHtml || "");
  }, [editor, markdownText]);

  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const processImage = useCallback(
    async (file: File): Promise<boolean> => {
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

        setLoadingLabel("Đang gửi lên OCR...");
        setLoadingProgress(45);
        const r = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
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

        // Save to history
        setLoadingLabel("Đang lưu lịch sử...");
        setLoadingProgress(92);
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
        console.error("OCR error:", err);
        toast.error("Lỗi khi xử lý hình ảnh. Vui lòng thử lại.");
      } finally {
        setIsProcessing(false);
        setLoadingLabel("");
        setLoadingProgress(0);
      }

      return ok;
    },
    [fileToBase64],
  );

  useEffect(() => {
    // When a new image is uploaded, reset the workspace to "edit" phase.
    setPhase("edit");
    setEditFile(imageFile);
    setEnhance(false);
    setShowHistory(false);
    setActiveTab("markdown");

    // Clear current OCR result.
    setMarkdownText("");
    setJsonText("");
    setBoundingBoxes([]);
  }, [imageFile]);

  useEffect(() => {
    const url = URL.createObjectURL(editFile);
    setEditImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [editFile]);

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
    if (lastOcrBlobUrlRef.current) URL.revokeObjectURL(lastOcrBlobUrlRef.current);
    lastOcrBlobUrlRef.current = url;
    setImageUrl(url);
  }, []);

  const startOcr = useCallback(async () => {
    if (isProcessing) return;
    if (!editFile) return;

    setShowHistory(false);
    setActiveTab("markdown");
    setPhase("processing");

    let fileForOcr = editFile;

    try {
      if (cropperApiRef.current) {
        const blob = await cropperApiRef.current.exportCroppedBlob();
        const type = blob.type || editFile.type || "image/png";
        fileForOcr = new File([blob], `${editFile.name}_cropped.png`, {
          type,
        });
      }

      if (enhance) {
        fileForOcr = await enhanceFile(fileForOcr, {
          contrast: 1.28,
          brightness: 1.03,
          sharpenPass: 1,
        });
      }
    } catch {
      toast.error("Không thể xuất ảnh đã crop. Vui lòng thử lại.");
      setPhase("edit");
      return;
    }

    setOcrImageFromFile(fileForOcr);
    const ok = await processImage(fileForOcr);
    setPhase(ok ? "result" : "edit");
  }, [enhance, editFile, isProcessing, processImage, setOcrImageFromFile]);

  const applyRotate = useCallback(
    async (angleDegrees: number) => {
      if (isProcessing || isEditingBusy) return;
      setIsEditingBusy(true);
      try {
        cropperApiRef.current?.rotate(angleDegrees);
      } catch {
        toast.error("Lỗi khi xoay ảnh. Vui lòng thử lại.");
      } finally {
        setIsEditingBusy(false);
      }
    },
    [isEditingBusy, isProcessing],
  );

  const applyEnhance = useCallback(
    async () => {
      if (isProcessing || isEditingBusy) return;
      // Toggle enhancement. Real enhancement is applied right before OCR.
      setEnhance((v) => !v);
    },
    [isEditingBusy, isProcessing],
  );

  const handleReprocess = useCallback(() => {
    if (phase === "result") {
      // Go back to edit mode while keeping the last edited image.
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
  }, [phase, startOcr]);

  const toggleHistory = useCallback(() => {
    if (phase !== "result") return;
    setShowHistory((v) => !v);
  }, [phase]);

  const handleCopy = useCallback(() => {
    let toCopy = "";
    if (activeTab === "json") {
      toCopy = jsonText;
    } else if (activeTab === "markdown") {
      toCopy = editor ? turndown.turndown(editor.getHTML()) : markdownText;
    } else {
      toCopy = "";
    }
    navigator.clipboard.writeText(toCopy);
    setCopied(true);
    toast.success("Đã sao chép văn bản!");
    setTimeout(() => setCopied(false), 2000);
  }, [activeTab, editor, jsonText, markdownText, turndown]);

  const handleDownload = useCallback(
    (format?: "markdown" | "json") => {
      const tab = format ?? activeTab;
      const isJson = tab === "json";
      const content = isJson
        ? jsonText
        : editor
          ? turndown.turndown(editor.getHTML())
          : markdownText;
      const mime = isJson
        ? "application/json;charset=utf-8"
        : "text/markdown;charset=utf-8";
      const filename = isJson ? "ocr-result.json" : "ocr-result.md";
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Đã tải xuống file văn bản!");
    },
    [activeTab, editor, jsonText, markdownText, turndown],
  );

  const handleExportPdf = useCallback(() => {
    const currentMarkdown =
      activeTab === "json"
        ? jsonText
        : editor
          ? turndown.turndown(editor.getHTML())
          : markdownText;
    const text = currentMarkdown.trim();
    if (!text && !imageUrl) {
      toast.error("Chưa có nội dung để xuất PDF.");
      return;
    }

    const title = imageFile?.name ? `VietOCR — ${imageFile.name}` : "VietOCR";

    const doc = new jsPDF({
      unit: "mm",
      format: "a4",
      putOnlyUsedFonts: true,
    });

    const marginX = 15;
    let cursorY = 20;

    doc.setFontSize(14);
    doc.setTextColor(137, 25, 28);
    doc.text("VietOCR", marginX, cursorY);

    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(new Date().toLocaleString("vi-VN"), 210 - marginX, cursorY, {
      align: "right",
    });

    cursorY += 8;

    let capturedEditor = false;
    const captureEditorPromise =
      editor && document.querySelector<HTMLElement>(".ProseMirror")
        ? (() => {
            const el = document.querySelector(".ProseMirror") as HTMLElement;
            const h = Math.max(el.scrollHeight, el.clientHeight);
            return html2canvas(el, {
              scale: window.devicePixelRatio || 2,
              backgroundColor: "#ffffff",
              height: h,
              windowHeight: h,
              scrollY: -window.scrollY,
              useCORS: true,
            }).then((canvas) => {
              const imgData = canvas.toDataURL("image/png");
              const pageWidth = 210 - marginX * 2;
              const imgWidth = pageWidth;
              const imgHeight = (canvas.height * imgWidth) / canvas.width;

              if (cursorY + imgHeight > 287) {
                doc.addPage();
                cursorY = 20;
              }

              doc.addImage(
                imgData,
                "PNG",
                marginX,
                cursorY,
                imgWidth,
                imgHeight,
              );
              cursorY += imgHeight + 4;
              capturedEditor = true;
            });
          })()
        : Promise.resolve();

    const addImagePromise =
      imageUrl && imageUrl.startsWith("data:")
        ? new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const maxWidth = 210 - marginX * 2;
              const maxHeight = 80;
              let w = img.width;
              let h = img.height;
              const ratio = Math.min(maxWidth / w, maxHeight / h);
              w *= ratio;
              h *= ratio;
              if (cursorY + h > 287) {
                doc.addPage();
                cursorY = 20;
              }
              doc.addImage(img, "PNG", marginX, cursorY, w, h);
              cursorY += h + 6;
              resolve();
            };
            img.onerror = () => resolve();
            img.src = imageUrl;
          })
        : Promise.resolve();

    Promise.all([captureEditorPromise, addImagePromise]).then(() => {
      // Nếu đã capture đúng "Kết quả OCR" (giữ format), không append text thô nữa
      // để tránh bị dư/loạn ký tự (đặc biệt với bảng HTML).
      if (!capturedEditor) {
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        const lines = doc.splitTextToSize(text || "", 210 - marginX * 2);

        for (const line of lines) {
          if (cursorY > 287) {
            doc.addPage();
            cursorY = 20;
          }
          doc.text(line as string, marginX, cursorY);
          cursorY += 5;
        }
      }

      doc.save(`${title || "vietocr"}.pdf`);
      toast.success("Đã xuất PDF và tải về máy.");
    });
  }, [
    activeTab,
    editor,
    imageFile?.name,
    imageUrl,
    jsonText,
    markdownText,
    turndown,
  ]);

  const handleHistorySelect = (entry: {
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
            const res = await fetch(entry.image_data);
            const blob = await res.blob();
            const type = blob.type || "image/png";
            setEditFile(
              new File([blob], entry.image_name || "ocr-history.png", {
                type,
              }),
            );
          } catch {
            // If conversion fails, keep editFile as-is.
          }
        })();
      }
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col min-h-0">
      <OCRToolbar
        fileName={imageFile.name}
        isProcessing={isProcessing}
        loadingLabel={loadingLabel}
        hasText={Boolean(markdownText || jsonText)}
        copied={copied}
        onBack={onBack}
        onReprocess={handleReprocess}
        onPickAnother={onBack}
        onToggleHistory={toggleHistory}
        onCopy={handleCopy}
        onDownloadMarkdown={() => handleDownload("markdown")}
        onDownloadJson={() => handleDownload("json")}
        onExportPdf={handleExportPdf}
      />
      {isProcessing && (
        <div className="border-b border-border bg-card px-4 py-2">
          <Progress value={loadingProgress} className="h-2" />
        </div>
      )}

      {/* Content */}
      {phase === "result" ? (
        <>
          <div className="flex flex-1 flex-col lg:flex-row overflow-hidden min-h-0">
            {/* Left: Image with bounding boxes */}
            <div className="flex flex-1 w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-border min-h-[240px] lg:min-h-0">
              <ImageViewer
                imageUrl={imageUrl}
                boxes={boundingBoxes}
                isProcessing={isProcessing}
              />
            </div>

            {/* Right: Text editor */}
            <div className="flex flex-1 flex-col min-h-0 w-full lg:w-auto">
              <div className="border-b border-border px-4 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Kết quả OCR
                </span>
                <div className="flex items-center gap-3">
                  {boundingBoxes.length > 0 && (
                    <span className="text-[10px] text-accent font-medium">
                      {boundingBoxes.length} vùng phát hiện
                    </span>
                  )}
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as "markdown" | "json")}
                  >
                    <TabsList className="h-8">
                      <TabsTrigger
                        className="px-2 py-1 text-xs"
                        value="markdown"
                      >
                        Markdown
                      </TabsTrigger>
                      <TabsTrigger className="px-2 py-1 text-xs" value="json">
                        JSON
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              <div className="flex-1 overflow-hidden min-h-0">
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v as "markdown" | "json")}
                  className="h-full"
                >
                  <TabsContent value="markdown" className="m-0 h-full">
                    <MarkdownEditor
                      editor={editor}
                      isProcessing={isProcessing}
                    />
                  </TabsContent>
                  <TabsContent value="json" className="m-0 h-full">
                    <JsonViewer
                      jsonText={jsonText}
                      isProcessing={isProcessing}
                      onChange={setJsonText}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            {/* History sidebar (desktop) */}
            {showHistory && isLg && (
              <HistorySidebar
                isOpen={true}
                onSelect={handleHistorySelect}
                refreshKey={historyRefresh}
              />
            )}
          </div>

          {/* History sidebar (mobile drawer) */}
          {showHistory && !isLg && (
            <div
              className="fixed inset-0 z-50 bg-black/40"
              onClick={() => setShowHistory(false)}
            >
              <div
                className="absolute right-0 top-0 h-full"
                onClick={(e) => e.stopPropagation()}
              >
                <HistorySidebar
                  isOpen={true}
                  onSelect={(entry) => {
                    handleHistorySelect(entry);
                    setShowHistory(false);
                  }}
                  refreshKey={historyRefresh}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Left: Image preview + crop selector */}
          <div className="flex flex-1 w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-border min-h-[240px] lg:min-h-0">
            {editImageUrl ? (
              <ImageCropper
                src={editImageUrl}
                disabled={isProcessing}
                onApiReady={(api) => {
                  cropperApiRef.current = api;
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-6 text-sm text-muted-foreground">
                Đang tải ảnh...
              </div>
            )}
          </div>

          {/* Right: Tools */}
          <div className="flex flex-1 flex-col min-h-0 w-full lg:w-auto">
            <div className="border-b border-border px-4 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Chỉnh sửa ảnh
              </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    Kéo để chọn vùng OCR (crop)
                  </span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                      <RotateCcw className="h-4 w-4 text-primary" />
                    </span>
                    Xoay ảnh
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void applyRotate(-90)}
                      disabled={isProcessing || isEditingBusy}
                      className="gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Trái 90°
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void applyRotate(90)}
                      disabled={isProcessing || isEditingBusy}
                      className="gap-1.5"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      Phải 90°
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </span>
                    Làm rõ ảnh
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void applyEnhance()}
                    disabled={isProcessing || isEditingBusy}
                    className="w-full sm:w-auto"
                  >
                    <Sparkles className="mr-2 h-3.5 w-3.5" />
                    {enhance ? "Đang bật" : "Tăng tương phản nhẹ"}
                  </Button>
                </div>

                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                      <Crop className="h-4 w-4 text-primary" />
                    </span>
                    Vùng OCR
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cropperApiRef.current?.reset()}
                      disabled={isProcessing || isEditingBusy}
                    >
                      Toàn ảnh
                    </Button>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    Thu nhỏ/di chuyển khung crop để OCR đúng vùng.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditFile(imageFile);
                      setEnhance(false);
                      cropperApiRef.current?.reset();
                    }}
                    disabled={isProcessing || isEditingBusy}
                  >
                    Reset ảnh
                  </Button>

                  <Button
                    onClick={() => void startOcr()}
                    disabled={isProcessing || isEditingBusy || !editImageUrl}
                    className="flex-1"
                  >
                    Bắt đầu OCR
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OCRWorkspace;
