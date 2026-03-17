import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Copy, Download, Check, Loader2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ImageViewer, { type BoundingBox } from "@/components/ImageViewer";
import HistorySidebar from "@/components/HistorySidebar";
import type { Json } from "@/integrations/supabase/types";

interface OCRWorkspaceProps {
  imageFile: File;
  onBack: () => void;
}

const OCRWorkspace = ({ imageFile, onBack }: OCRWorkspaceProps) => {
  const [imageUrl, setImageUrl] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    processImage(imageFile);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setExtractedText("");
    setBoundingBoxes([]);

    try {
      const base64 = await fileToBase64(file);

      const response = await supabase.functions.invoke("ocr-vietnamese", {
        body: { image: base64, mimeType: file.type },
      });

      if (response.error) {
        throw new Error(response.error.message || "OCR failed");
      }

      const text = response.data?.text || "Không phát hiện văn bản.";
      const blocks: BoundingBox[] = response.data?.blocks || [];

      setExtractedText(text);
      setBoundingBoxes(blocks);

      // Save to history
      await supabase.from("ocr_history").insert({
        image_name: file.name,
        extracted_text: text,
        bounding_boxes: blocks as unknown as Json,
        image_data: `data:${file.type};base64,${base64}`,
      });
      setHistoryRefresh((p) => p + 1);
    } catch (err: any) {
      console.error("OCR error:", err);
      toast.error("Lỗi khi xử lý hình ảnh. Vui lòng thử lại.");
    } finally {
      setIsProcessing(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(extractedText);
    setCopied(true);
    toast.success("Đã sao chép văn bản!");
    setTimeout(() => setCopied(false), 2000);
  }, [extractedText]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([extractedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ocr-result.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Đã tải xuống file văn bản!");
  }, [extractedText]);

  const handleHistorySelect = (entry: any) => {
    setExtractedText(entry.extracted_text);
    setBoundingBoxes(entry.bounding_boxes || []);
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
            <span className="text-xs font-medium">Đang nhận diện...</span>
          </div>
        )}

        <div className="ml-auto flex gap-2">
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
            disabled={!extractedText || isProcessing}
            className="gap-1.5"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Đã sao chép" : "Sao chép"}
          </Button>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={!extractedText || isProcessing}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Tải xuống
          </Button>
        </div>
      </div>

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
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Văn bản nhận diện
            </span>
            {boundingBoxes.length > 0 && (
              <span className="text-[10px] text-accent font-medium">
                {boundingBoxes.length} vùng phát hiện
              </span>
            )}
          </div>
          <textarea
            value={extractedText}
            onChange={(e) => setExtractedText(e.target.value)}
            placeholder={isProcessing ? "Đang xử lý..." : "Văn bản sẽ xuất hiện ở đây..."}
            className="flex-1 resize-none bg-card p-4 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground font-body"
            disabled={isProcessing}
          />
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
