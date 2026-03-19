import { ArrowLeft, Check, Copy, Download, History, ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface OCRToolbarProps {
  fileName: string;
  isProcessing: boolean;
  loadingLabel: string;
  hasText: boolean;
  copied: boolean;
  onBack: () => void;
  onReprocess: () => void;
  onPickAnother: () => void;
  onToggleHistory: () => void;
  onCopy: () => void;
  onDownloadMarkdown: () => void;
  onDownloadJson: () => void;
  onExportPdf: () => void;
}

const OCRToolbar = ({
  fileName,
  isProcessing,
  loadingLabel,
  hasText,
  copied,
  onBack,
  onReprocess,
  onPickAnother,
  onToggleHistory,
  onCopy,
  onDownloadMarkdown,
  onDownloadJson,
  onExportPdf,
}: OCRToolbarProps) => {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" />
        Quay lại
      </Button>
      <div className="h-5 w-px bg-border" />
      <span className="text-sm font-medium text-muted-foreground truncate max-w-[200px]">
        {fileName}
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
          onClick={onReprocess}
          disabled={isProcessing}
          className="gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Nhận diện lại
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onPickAnother}
          disabled={isProcessing}
          className="gap-1.5"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          Ảnh khác
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleHistory}
          className="gap-1.5"
        >
          <History className="h-3.5 w-3.5" />
          Lịch sử
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCopy}
          disabled={!hasText || isProcessing}
          className="gap-1.5"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Đã sao chép" : "Sao chép"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              disabled={!hasText || isProcessing}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              Tải
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onDownloadMarkdown}>
              Tải Markdown (.md)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDownloadJson}>
              Tải JSON (.json)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExportPdf}>
              Xuất PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default OCRToolbar;

