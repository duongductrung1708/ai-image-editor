import {
  FileStack,
  HardDrive,
  Layers,
  ListOrdered,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatBatchFileSize } from "@/lib/batchWorkspaceUtils";

interface BatchReadyViewProps {
  files: File[];
  sourcePreviewUrls: string[];
  totalBytes: number;
  extensionSummary: [string, number][];
  isProcessing: boolean;
  onStartBatch: () => void;
  quotaRemaining?: number;
  quotaUnlimited?: boolean;
}

/**
 * Màn “Danh sách tệp” trước khi chạy OCR batch.
 */
const BatchReadyView = ({
  files,
  sourcePreviewUrls,
  totalBytes,
  extensionSummary,
  isProcessing,
  onStartBatch,
  quotaRemaining,
  quotaUnlimited,
}: BatchReadyViewProps) => {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-gradient-to-b from-primary/[0.06] via-background to-background pb-24 sm:pb-6">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-6 md:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              OCR hàng loạt
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Danh sách tệp
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              Ảnh được xử lý theo <strong>thứ tự tên tệp</strong>. Sau khi xong,
              bạn gộp một lần sang Markdown hoặc Word — có thể đối chiếu song
              song từng trang với văn bản.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button
              size="lg"
              className="shrink-0 gap-2 shadow-md"
              onClick={onStartBatch}
              disabled={isProcessing}
            >
              <ListOrdered className="h-4 w-4" />
              Bắt đầu OCR tất cả
            </Button>
            {!quotaUnlimited && quotaRemaining !== undefined && (
              <span className={`text-xs font-medium ${quotaRemaining <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                Còn lại: {quotaRemaining} lượt hôm nay
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border-primary/15 bg-card/80 shadow-sm backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2 pt-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers className="h-5 w-5" />
              </div>
              <div>
                <CardDescription>Số trang / ảnh</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {files.length}
                </CardTitle>
              </div>
            </CardHeader>
          </Card>
          <Card className="border-primary/15 bg-card/80 shadow-sm backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2 pt-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HardDrive className="h-5 w-5" />
              </div>
              <div>
                <CardDescription>Tổng dung lượng</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {formatBatchFileSize(totalBytes)}
                </CardTitle>
              </div>
            </CardHeader>
          </Card>
          <Card className="border-primary/15 bg-card/80 shadow-sm backdrop-blur-sm sm:col-span-1">
            <CardHeader className="space-y-2 pb-3 pt-4">
              <CardDescription>Định dạng</CardDescription>
              <div className="flex flex-wrap gap-1.5">
                {extensionSummary.map(([ext, count]) => (
                  <Badge key={ext} variant="secondary" className="font-normal">
                    {ext} ×{count}
                  </Badge>
                ))}
              </div>
            </CardHeader>
          </Card>
        </div>

        <Card className="overflow-hidden border-border shadow-sm">
          <CardHeader className="border-b border-border bg-muted/30 py-4">
            <CardTitle className="text-base font-display">
              Xem trước & thứ tự
            </CardTitle>
            <CardDescription>
              Kéo danh sách nếu nhiều file — thứ tự dưới đây là thứ tự OCR.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[min(52vh,420px)]">
              <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${f.size}-${f.lastModified}`}
                    className="group relative overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] bg-muted">
                      {sourcePreviewUrls[i] ? (
                        <img
                          src={sourcePreviewUrls[i]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <FileStack className="h-10 w-10 opacity-40" />
                        </div>
                      )}
                      <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-xs font-bold shadow-sm ring-1 ring-border">
                        {i + 1}
                      </span>
                    </div>
                    <div className="space-y-1 p-3">
                      <p
                        className="line-clamp-2 text-sm font-medium leading-snug"
                        title={f.name}
                      >
                        {f.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBatchFileSize(f.size)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="rounded-xl border border-dashed border-primary/25 bg-primary/[0.04] p-4 md:p-5">
          <p className="mb-3 text-sm font-medium text-foreground">
            Trước khi chạy
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-primary">1.</span>
              Kiểm tra thứ tự tên file (vd.{" "}
              <code className="rounded bg-muted px-1 text-xs">
                page_01
              </code>,{" "}
              <code className="rounded bg-muted px-1 text-xs">page_02</code>).
            </li>
            <li className="flex gap-2">
              <span className="text-primary">2.</span>
              Ảnh quá lớn có thể làm chậm API — nên resize nếu mỗi trang &gt;
              vài MB.
            </li>
            <li className="flex gap-2">
              <span className="text-primary">3.</span>
              Server xử lý song song có giới hạn luồng để tránh quá tải.
            </li>
          </ul>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 p-3 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md sm:hidden">
        <Button
          className="h-11 w-full gap-2 font-semibold shadow-sm"
          onClick={onStartBatch}
          disabled={isProcessing}
        >
          <ListOrdered className="h-4 w-4" />
          Bắt đầu OCR tất cả
        </Button>
      </div>
    </div>
  );
};

export default BatchReadyView;
