import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Copy, Download, Check, Loader2, History, RefreshCw, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ImageViewer, { type BoundingBox } from "@/components/ImageViewer";
import HistorySidebar from "@/components/HistorySidebar";
import type { Json } from "@/integrations/supabase/types";
import { isOcrErrorResponse, isOcrSuccessResponse, type OcrApiResponse } from "@/types/ocr";

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
  const [activeTab, setActiveTab] = useState<"markdown" | "json">("markdown");

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
          const msg = data && isOcrErrorResponse(data) ? data.error : "OCR failed";
          throw new Error(msg);
        }

        if (!data || !isOcrSuccessResponse(data)) {
          throw new Error("OCR API returned unexpected response");
        }

        const md = data.markdown.length > 0 ? data.markdown : "";
        const fullText = data.full_text.length > 0 ? data.full_text : "";
        const blocks: BoundingBox[] = Array.isArray(data.blocks) ? (data.blocks as unknown as BoundingBox[]) : [];

        const mdOut = md.length > 0 ? md : fullText.length > 0 ? fullText : "Không phát hiện văn bản.";
        setMarkdownText(mdOut);
        setJsonText(
          JSON.stringify(
            {
              markdown: mdOut,
              full_text: fullText,
              blocks,
              ...(typeof data.warning === "string" ? { warning: data.warning } : null),
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
    const toCopy = activeTab === "json" ? jsonText : markdownText;
    navigator.clipboard.writeText(toCopy);
    setCopied(true);
    toast.success("Đã sao chép văn bản!");
    setTimeout(() => setCopied(false), 2000);
  }, [activeTab, jsonText, markdownText]);

  const handleDownload = useCallback((format?: "markdown" | "json") => {
    const tab = format ?? activeTab;
    const isJson = tab === "json";
    const content = isJson ? jsonText : markdownText;
    const mime = isJson ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8";
    const filename = isJson ? "ocr-result.json" : "ocr-result.md";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Đã tải xuống file văn bản!");
  }, [activeTab, jsonText, markdownText]);

  const handleExportPdf = useCallback(() => {
    const text = (activeTab === "json" ? jsonText : markdownText).trim();
    if (!text && !imageUrl) {
      toast.error("Chưa có nội dung để xuất PDF.");
      return;
    }

    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) {
      toast.error("Trình duyệt đang chặn popup. Hãy cho phép để xuất PDF.");
      return;
    }

    const styles = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
      .map((el) => el.outerHTML)
      .join("\n");

    const title = imageFile?.name ? `VietOCR — ${imageFile.name}` : "VietOCR";
    const safeText =
      text.length > 0
        ? text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
        : "";

    const imgHtml =
      imageUrl && imageUrl.length > 0
        ? `<img src="${imageUrl}" alt="OCR source" class="preview" />`
        : "";

    w.document.open();
    w.document.write(`<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</title>
    <base href="${window.location.origin}/" />
    ${styles}
    <style>
      @page { margin: 14mm; }
      body { background: #fff !important; }
      .pdf-wrap {
        max-width: 860px;
        margin: 0 auto;
        padding: 0;
        font-family: "Be Vietnam Pro", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        color: #111;
      }
      .header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
        border-bottom: 1px solid rgba(0,0,0,0.08);
        padding-bottom: 10px;
      }
      .brand { font-weight: 800; letter-spacing: -0.02em; font-size: 20px; color: #89191C; }
      .meta { font-size: 12px; color: rgba(0,0,0,0.6); }
      .preview {
        width: 100%;
        max-height: 420px;
        object-fit: contain;
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 10px;
        margin: 12px 0 14px;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12.5px;
        line-height: 1.6;
        padding: 12px;
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 10px;
        background: #fff;
      }
      .hint { display: none; }
      @media print {
        .hint { display: none; }
      }
    </style>
  </head>
  <body>
    <div class="pdf-wrap">
      <div class="header">
        <div class="brand">VietOCR</div>
        <div class="meta">${new Date().toLocaleString("vi-VN")}</div>
      </div>
      ${imgHtml}
      ${safeText ? `<pre>${safeText}</pre>` : ""}
    </div>
    <script>
      window.onload = () => {
        setTimeout(() => {
          window.focus();
          window.print();
        }, 250);
      };
    </script>
  </body>
</html>`);
    w.document.close();

    toast.message("Đang mở hộp thoại in — chọn “Save as PDF” để xuất file.");
  }, [activeTab, imageFile?.name, imageUrl, jsonText, markdownText]);

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
    <div className="flex h-screen flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </Button>
        <div className="h-5 w-px bg-border" />
        <span className="text-sm font-medium text-muted-foreground truncate max-w-[200px]">
          {imageFile.name}
        </span>

        {isProcessing && (
          <div className="flex items-center gap-1.5 text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs font-medium">{loadingLabel || "Đang nhận diện..."}</span>
          </div>
        )}

        <div className="ml-auto flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => processImage(imageFile)}
            disabled={isProcessing}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Nhận diện lại
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            disabled={isProcessing}
            className="gap-1.5"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Ảnh khác
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="gap-1.5"
          >
            <History className="h-3.5 w-3.5" />
            Lịch sử
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={(!markdownText && !jsonText) || isProcessing}
            className="gap-1.5"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Đã sao chép" : "Sao chép"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                disabled={(!markdownText && !jsonText) || isProcessing}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Tải
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleDownload("markdown")}>
                Tải Markdown (.md)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload("json")}>
                Tải JSON (.json)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportPdf}>
                Xuất PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {isProcessing && (
        <div className="border-b border-border bg-card px-4 py-2">
          <Progress value={loadingProgress} className="h-2" />
        </div>
      )}

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Image with bounding boxes */}
        <div className="flex w-1/2 border-r border-border">
          <ImageViewer
            imageUrl={imageUrl}
            boxes={boundingBoxes}
            isProcessing={isProcessing}
          />
        </div>

        {/* Right: Text editor */}
        <div className="flex flex-1 flex-col">
          <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Kết quả OCR</span>
            <div className="flex items-center gap-3">
              {boundingBoxes.length > 0 && (
                <span className="text-[10px] text-accent font-medium">{boundingBoxes.length} vùng phát hiện</span>
              )}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "markdown" | "json")}>
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

          <div className="flex-1 overflow-hidden">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "markdown" | "json")} className="h-full">
              <TabsContent value="markdown" className="m-0 h-full">
                {isProcessing && !markdownText ? (
                  <div className="h-full w-full p-4 space-y-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-10/12" />
                    <Skeleton className="h-4 w-9/12" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ) : (
                  <textarea
                    value={markdownText}
                    onChange={(e) => setMarkdownText(e.target.value)}
                    placeholder={isProcessing ? "Đang xử lý..." : "Markdown sẽ xuất hiện ở đây..."}
                    className="h-full w-full resize-none bg-card p-4 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground font-body"
                    disabled={isProcessing}
                  />
                )}
              </TabsContent>
              <TabsContent value="json" className="m-0 h-full">
                {isProcessing && !jsonText ? (
                  <div className="h-full w-full p-4 space-y-3">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-10/12" />
                    <Skeleton className="h-4 w-9/12" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                  </div>
                ) : (
                  <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    placeholder={isProcessing ? "Đang xử lý..." : "JSON sẽ xuất hiện ở đây..."}
                    className="h-full w-full resize-none bg-card p-4 font-mono text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                    disabled={isProcessing}
                  />
                )}
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
