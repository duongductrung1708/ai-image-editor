import { useMemo, useState, useCallback, useEffect } from "react";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ImageViewer, { type BoundingBox } from "@/components/ImageViewer";
import HistorySidebar from "@/components/HistorySidebar";
import type { Json } from "@/integrations/supabase/types";
import {
  isOcrErrorResponse,
  isOcrSuccessResponse,
  type OcrApiResponse,
} from "@/types/ocr";
import OCRToolbar from "@/components/ocr/OCRToolbar";
import MarkdownEditor from "@/components/ocr/MarkdownEditor";
import JsonViewer from "@/components/ocr/JsonViewer";

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

  marked.setOptions({ gfm: true, breaks: true });

  const turndown = useMemo(() => {
    const td = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    td.use(gfm);
    return td;
  }, []);

  const editor = useEditor({
    extensions: [
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
    async (file: File) => {
      setIsProcessing(true);
      setLoadingLabel("Chuẩn bị ảnh...");
      setLoadingProgress(10);
      setMarkdownText("");
      setJsonText("");
      setBoundingBoxes([]);

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
      } catch (err: unknown) {
        console.error("OCR error:", err);
        toast.error("Lỗi khi xử lý hình ảnh. Vui lòng thử lại.");
      } finally {
        setIsProcessing(false);
        setLoadingLabel("");
        setLoadingProgress(0);
      }
    },
    [fileToBase64],
  );

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    processImage(imageFile);
    return () => URL.revokeObjectURL(url);
  }, [imageFile, processImage]);

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
    doc.text(new Date().toLocaleString("vi-VN"), 210 - marginX, cursorY, { align: "right" });

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

            doc.addImage(imgData, "PNG", marginX, cursorY, imgWidth, imgHeight);
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
    }
  };

  return (
    <div className="flex h-screen flex-col min-h-0">
      <OCRToolbar
        fileName={imageFile.name}
        isProcessing={isProcessing}
        loadingLabel={loadingLabel}
        hasText={Boolean(markdownText || jsonText)}
        copied={copied}
        onBack={onBack}
        onReprocess={() => processImage(imageFile)}
        onPickAnother={onBack}
        onToggleHistory={() => setShowHistory((v) => !v)}
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
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left: Image with bounding boxes */}
        <div className="flex w-full lg:w-1/2 border-b lg:border-b-0 lg:border-r border-border min-h-[240px] lg:min-h-0">
          <ImageViewer
            imageUrl={imageUrl}
            boxes={boundingBoxes}
            isProcessing={isProcessing}
          />
        </div>

        {/* Right: Text editor */}
        <div className="flex flex-1 flex-col min-h-0 w-full lg:w-auto">
          <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
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
                  <TabsTrigger className="px-2 py-1 text-xs" value="markdown">
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
                <MarkdownEditor editor={editor} isProcessing={isProcessing} />
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

        {/* History sidebar */}
        <HistorySidebar
          isOpen={showHistory}
          onSelect={handleHistorySelect}
          refreshKey={historyRefresh}
        />
      </div>
    </div>
  );
};

export default OCRWorkspace;
