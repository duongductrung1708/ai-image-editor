import { useCallback, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { Crop, GripVertical, RotateCcw, RotateCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import ImageCropper, {
  type ImageCropperApi,
} from "@/components/ocr/ImageCropper";

interface SingleImageEditPhaseProps {
  editImageUrl: string;
  ocrPipelineBusy: boolean;
  isEditingBusy: boolean;
  enhance: boolean;
  cropperApiRef: MutableRefObject<ImageCropperApi | null>;
  onCropperApiReady: (api: ImageCropperApi) => void;
  onRotate: (degrees: number) => void;
  onToggleEnhance: () => void;
  onResetImage: () => void;
  onStartOcr: () => void;
  quotaRemaining?: number;
  quotaUnlimited?: boolean;
}

/**
 * Crop + bảng công cụ trước khi OCR một ảnh.
 */
const SingleImageEditPhase = ({
  editImageUrl,
  ocrPipelineBusy,
  isEditingBusy,
  enhance,
  cropperApiRef,
  onCropperApiReady,
  onRotate,
  onToggleEnhance,
  onResetImage,
  onStartOcr,
  quotaRemaining,
  quotaUnlimited,
}: SingleImageEditPhaseProps) => {
  const HANDLE_PX = 10;
  const MIN_LEFT_PCT = 30;
  const MAX_LEFT_PCT = 70;

  const [leftPct, setLeftPct] = useState(50);
  const splitRef = useRef<HTMLDivElement | null>(null);

  const onResizeHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const container = splitRef.current;
      if (!container) return;
      const containerWidth = container.getBoundingClientRect().width;
      if (!containerWidth) return;

      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startPct = leftPct;

      const onPointerMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const nextPct = startPct + (dx / containerWidth) * 100;
        setLeftPct(Math.min(MAX_LEFT_PCT, Math.max(MIN_LEFT_PCT, nextPct)));
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", cleanup, { once: true });
      window.addEventListener("pointercancel", cleanup, { once: true });
    },
    [leftPct],
  );

  const leftPanel = editImageUrl ? (
    <ImageCropper
      src={editImageUrl}
      disabled={ocrPipelineBusy}
      onApiReady={onCropperApiReady}
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center p-6 text-sm text-muted-foreground">
      Đang tải ảnh...
    </div>
  );

  const rightPanel = (
    <>
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Chỉnh sửa ảnh
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            Kéo để chọn vùng OCR (crop)
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
                onClick={() => void onRotate(-90)}
                disabled={ocrPipelineBusy || isEditingBusy}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Trái 90°
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onRotate(90)}
                disabled={ocrPipelineBusy || isEditingBusy}
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
              onClick={() => void onToggleEnhance()}
              disabled={ocrPipelineBusy || isEditingBusy}
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
                disabled={ocrPipelineBusy || isEditingBusy}
              >
                Toàn ảnh
              </Button>
            </div>

            {!quotaUnlimited && quotaRemaining !== undefined && (
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                Còn lại:{" "}
                <span className={quotaRemaining <= 3 ? "text-destructive" : "text-primary"}>
                  {quotaRemaining}
                </span>
                /10 lượt hôm nay
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Thu nhỏ/di chuyện khung crop để OCR đúng vùng.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={onResetImage}
              disabled={ocrPipelineBusy || isEditingBusy}
            >
              Reset ảnh
            </Button>

            <Button
              onClick={() => void onStartOcr()}
              disabled={ocrPipelineBusy || isEditingBusy || !editImageUrl}
              className="flex-1"
            >
              Bắt đầu OCR
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Mobile: giữ layout cũ */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="flex min-h-[240px] w-full flex-1 border-b border-border">{leftPanel}</div>
        <div className="flex min-h-0 w-full flex-1 flex-col">{rightPanel}</div>
      </div>

      {/* Desktop: ảnh | editor có kéo resize */}
      <div
        ref={splitRef}
        className="hidden h-full min-h-0 flex-1 lg:grid overflow-hidden"
        style={{ gridTemplateColumns: `${leftPct}% ${HANDLE_PX}px 1fr` }}
      >
        <div className="min-h-0 h-full w-full overflow-hidden">{leftPanel}</div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize split"
          aria-valuemin={MIN_LEFT_PCT}
          aria-valuemax={MAX_LEFT_PCT}
          aria-valuenow={Math.round(leftPct)}
          className="relative z-10 flex h-full w-full cursor-col-resize items-center justify-center bg-border/40 hover:bg-border/70 touch-none select-none"
          onPointerDown={onResizeHandlePointerDown}
        >
          <div className="flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
            <GripVertical className="h-2.5 w-2.5" />
          </div>
        </div>
        <div className="min-h-0 h-full w-full overflow-hidden flex flex-col">{rightPanel}</div>
      </div>
    </div>
  );
};

export default SingleImageEditPhase;
