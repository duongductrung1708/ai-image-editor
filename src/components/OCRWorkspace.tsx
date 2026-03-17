import { useState, useCallback, useEffect } from "react";
import { ArrowLeft, Copy, Download, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface OCRWorkspaceProps {
  imageFile: File;
  onBack: () => void;
}

const OCRWorkspace = ({ imageFile, onBack }: OCRWorkspaceProps) => {
  const [imageUrl, setImageUrl] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    processImage(imageFile);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setExtractedText("");

    try {
      const base64 = await fileToBase64(file);

      const response = await supabase.functions.invoke("ocr-vietnamese", {
        body: { image: base64, mimeType: file.type },
      });

      if (response.error) {
        throw new Error(response.error.message || "OCR failed");
      }

      setExtractedText(response.data?.text || "Không phát hiện văn bản.");
    } catch (err: any) {
      console.error("OCR error:", err);
      toast.error("Lỗi khi xử lý hình ảnh. Vui lòng thử lại.");
      setExtractedText("");
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
        <div className="ml-auto flex gap-2">
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

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Image */}
        <div className="relative flex w-1/2 items-center justify-center overflow-auto border-r border-border bg-secondary/30 p-4">
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Uploaded"
              className="max-h-full max-w-full rounded-md object-contain"
            />
          )}
          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/40">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-primary animate-scan" />
              <div className="rounded-lg bg-card px-4 py-3 shadow-sm border border-border flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium text-foreground">Đang nhận diện...</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Text editor */}
        <div className="flex w-1/2 flex-col">
          <div className="border-b border-border px-4 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Văn bản nhận diện
            </span>
          </div>
          <textarea
            value={extractedText}
            onChange={(e) => setExtractedText(e.target.value)}
            placeholder={isProcessing ? "Đang xử lý..." : "Văn bản sẽ xuất hiện ở đây..."}
            className="flex-1 resize-none bg-card p-4 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground font-body"
            disabled={isProcessing}
          />
        </div>
      </div>
    </div>
  );
};

export default OCRWorkspace;
