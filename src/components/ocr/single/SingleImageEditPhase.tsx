import type { MutableRefObject } from "react";
import { Crop, RotateCcw, RotateCw, Sparkles } from "lucide-react";
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
  onRotate,
  onToggleEnhance,
  onResetImage,
  onStartOcr,
}: SingleImageEditPhaseProps) => {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="flex min-h-[240px] w-full flex-1 border-b border-border lg:min-h-0 lg:w-1/2 lg:border-b-0 lg:border-r">
        {editImageUrl ? (
          <ImageCropper
            src={editImageUrl}
            disabled={ocrPipelineBusy}
            onApiReady={onCropperApiReady}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 text-sm text-muted-foreground">
            Đang tải ảnh...
          </div>
        )}
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col lg:w-auto">
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

              <p className="mt-2 text-xs text-muted-foreground">
                Thu nhỏ/di chuyển khung crop để OCR đúng vùng.
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
      </div>
    </div>
  );
};

export default SingleImageEditPhase;
