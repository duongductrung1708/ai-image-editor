import { Cpu, FileStack, Loader2, Server } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import HistorySidebar from "@/components/HistorySidebar";
import type { OcrHistoryEntry } from "@/components/ocr/OcrHistoryMobileDrawer";

interface BatchProcessingViewProps {
  files: File[];
  sourcePreviewUrls: string[];
  showHistorySidebar: boolean;
  isLg: boolean;
  onHistorySelect: (entry: OcrHistoryEntry) => void;
  historyRefresh: number;
}

const PROCESSING_STEPS = [
  { label: "Phân tích ảnh & gọi model", active: true },
  { label: "Thu thập kết quả từng trang", active: true },
  { label: "Gộp văn bản & trả về", active: true },
] as const;

/**
 * Màn chờ OCR batch trên máy chủ (spinner, thumbnail, danh sách file).
 */
const BatchProcessingView = ({
  files,
  sourcePreviewUrls,
  showHistorySidebar,
  isLg,
  onHistorySelect,
  historyRefresh,
}: BatchProcessingViewProps) => {
  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
      <ScrollArea className="h-full min-h-0 min-w-0 flex-1 bg-gradient-to-b from-primary/[0.07] via-background to-muted/30">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-8 pb-16 md:max-w-2xl md:py-10 md:pb-20">
          <div className="relative mb-8">
            <div
              className="absolute -inset-6 rounded-full bg-primary/15 blur-2xl"
              aria-hidden
            />
            <div className="relative flex h-28 w-28 items-center justify-center rounded-2xl border border-primary/25 bg-card shadow-xl shadow-primary/10">
              <div className="absolute inset-2 rounded-xl border border-dashed border-primary/20" />
              <Server className="absolute -right-1 -top-1 h-7 w-7 rounded-lg border border-border bg-card p-1 text-primary shadow-sm" />
              <Loader2
                className="h-12 w-12 animate-spin text-primary"
                strokeWidth={1.25}
              />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Cpu className="h-3.5 w-3.5" />
            OCR trên máy chủ · giới hạn luồng
          </div>

          <h2 className="mt-4 text-center font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Đang OCR trên máy chủ
          </h2>
          <p className="mt-3 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
            Đang nhận diện{" "}
            <strong className="text-foreground">{files.length}</strong> ảnh.
            Máy chủ chạy{" "}
            <strong className="text-foreground">song song có giới hạn</strong>{" "}
            để tránh quá tải — với nhiều trang hoặc ảnh lớn có thể mất vài phút.
            Vui lòng không đóng tab.
          </p>

          {sourcePreviewUrls.some(Boolean) && (
            <div className="mt-6 w-full max-w-md">
              <p className="mb-2 text-center text-xs font-medium text-muted-foreground">
                Ảnh đang gửi ({files.length})
              </p>
              <div className="w-full overflow-x-auto rounded-xl border border-border/60 bg-card/40 [scrollbar-gutter:stable]">
                <div className="flex gap-2 p-2">
                  {files.map((f, i) => (
                    <div
                      key={`proc-thumb-${f.name}-${f.size}-${f.lastModified}`}
                      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted shadow-sm"
                      title={f.name}
                    >
                      {sourcePreviewUrls[i] ? (
                        <img
                          src={sourcePreviewUrls[i]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <FileStack className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                      )}
                      <span className="absolute bottom-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded bg-background/90 px-0.5 text-[9px] font-bold shadow ring-1 ring-border">
                        {i + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 w-full max-w-md space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tiến trình</span>
              <span className="tabular-nums">không xác định thời gian</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 w-[38%] rounded-full bg-gradient-to-r from-primary/50 via-primary to-primary/70 shadow-sm animate-ocr-shimmer"
                aria-hidden
              />
            </div>
          </div>

          <Card className="mt-10 w-full max-w-md border-primary/15 bg-card/90 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-3 pt-4">
              <CardTitle className="text-sm font-display">
                Các bước đang chạy
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Ảnh đã được gửi trong một yêu cầu; máy chủ OCR từng trang rồi
                gộp Markdown / JSON khi hoàn tất.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pb-4 pt-0">
              {PROCESSING_STEPS.map((step, i) => (
                <div
                  key={step.label}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-xs font-bold text-primary ring-1 ring-primary/20">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">
                      {step.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {step.active ? "Đang thực hiện…" : "Chờ"}
                    </p>
                  </div>
                  {step.active && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary opacity-80" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <ScrollArea className="mt-8 h-[min(28vh,200px)] w-full max-w-md rounded-xl border border-border/80 bg-card/50">
            <ul className="space-y-1 p-3 text-left">
              {files.map((f, i) => (
                <li
                  key={`proc-${f.name}-${f.size}-${f.lastModified}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {f.name}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-primary/80">
                    đang chờ
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      </ScrollArea>
      {showHistorySidebar && isLg && (
        <HistorySidebar
          isOpen={true}
          onSelect={onHistorySelect}
          refreshKey={historyRefresh}
        />
      )}
    </div>
  );
};

export default BatchProcessingView;
