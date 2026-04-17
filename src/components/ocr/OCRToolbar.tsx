import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  History,
  ImagePlus,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  /** OCR hàng loạt: xuất Word gộp */
  onDownloadDocx?: () => void;
  /** Ẩn nút "Nhận diện lại" (vd. màn chuẩn bị batch). Mặc định: hiện. */
  showReprocess?: boolean;
  /** Ẩn mục xuất PDF trong menu Tải. Mặc định: hiện. */
  showPdf?: boolean;
  /** Hiện nút hủy khi đang OCR (gọi abort / dừng pipeline). */
  onCancelProcessing?: () => void;
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
  onDownloadDocx,
  showReprocess = true,
  showPdf = true,
  onCancelProcessing,
}: OCRToolbarProps) => {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Quay lại trang trước</TooltipContent>
      </Tooltip>
      <div className="h-5 w-px bg-border" />
      <span className="text-sm font-medium text-muted-foreground truncate max-w-full sm:max-w-[200px]">
        {fileName}
      </span>

      {isProcessing && (
        <div className="flex flex-wrap items-center gap-2 text-primary">
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs font-medium">
              {loadingLabel || "Đang nhận diện..."}
            </span>
          </div>
          {onCancelProcessing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onCancelProcessing}
            >
              <XCircle className="h-3.5 w-3.5" />
              Hủy
            </Button>
          )}
        </div>
      )}

      <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        {showReprocess ? (
          <Tooltip>
            <TooltipTrigger asChild>
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
            </TooltipTrigger>
            <TooltipContent side="bottom">Chạy OCR lại với ảnh hiện tại</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onPickAnother}
              className="gap-1.5"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Ảnh khác
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Chọn ảnh khác để OCR</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleHistory}
              className="gap-1.5"
            >
              <History className="h-3.5 w-3.5" />
              Lịch sử
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Mở/đóng lịch sử OCR</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onCopy}
              disabled={!hasText || isProcessing}
              className="gap-1.5"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Đã sao chép" : "Sao chép"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Sao chép nội dung OCR</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  disabled={!hasText || isProcessing}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Tải
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Tải kết quả OCR</TooltipContent>
            </Tooltip>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onDownloadMarkdown}>
              Tải Markdown (.md)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDownloadJson}>
              Tải JSON (.json)
            </DropdownMenuItem>
            {onDownloadDocx && (
              <DropdownMenuItem
                onClick={() => {
                  void onDownloadDocx();
                }}
              >
                Word (.docx) gộp
              </DropdownMenuItem>
            )}
            {showPdf && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onExportPdf}>
                  Xuất PDF
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default OCRToolbar;
