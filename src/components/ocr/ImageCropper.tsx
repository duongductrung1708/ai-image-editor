import { useEffect, useMemo, useRef, useState } from "react";
import Cropper from "react-cropper";
import type CropperJS from "cropperjs";
import "@/styles/cropperjs.css";

export type ImageCropperApi = {
  exportCroppedBlob: () => Promise<Blob>;
  rotate: (deg: number) => void;
  flipHorizontal: () => void;
  /** Reset ALL transforms: rotate/flip/zoom + crop box. */
  resetAll: () => void;
  /** Reset ONLY crop box to cover the whole image. */
  resetCropToFullImage: () => void;
};

interface ImageCropperProps {
  src: string;
  disabled?: boolean;
  onApiReady?: (api: ImageCropperApi) => void;
}

const ImageCropper = ({
  src,
  disabled = false,
  onApiReady,
}: ImageCropperProps) => {
  const [ready, setReady] = useState(false);
  const cropperInstanceRef = useRef<CropperJS | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const syncCropperToContainer = (inst: CropperJS) => {
    const maybe = inst as unknown as { resize?: () => void };
    maybe.resize?.();

    const container = inst.getContainerData();
    if (!container?.width || !container?.height) return;

    let canvas = inst.getCanvasData();
    if (!canvas?.width || !canvas?.height) return;

    // If canvas exceeds container, scale down (never scale up).
    const scaleDown = Math.min(
      1,
      container.width / canvas.width,
      container.height / canvas.height,
    );
    if (scaleDown < 1) {
      const img = inst.getImageData() as unknown as { ratio?: number };
      const currentRatio = typeof img.ratio === "number" ? img.ratio : 1;
      const nextRatio = currentRatio * scaleDown;
      if (Number.isFinite(nextRatio) && nextRatio > 0) {
        inst.zoomTo(nextRatio);
        canvas = inst.getCanvasData();
      }
    }

    // Center canvas.
    inst.setCanvasData({
      left: (container.width - canvas.width) / 2,
      top: (container.height - canvas.height) / 2,
      width: canvas.width,
      height: canvas.height,
    });

    // Clamp crop box inside container (keep size).
    const cb = inst.getCropBoxData();
    const w = Math.min(cb.width, container.width);
    const h = Math.min(cb.height, container.height);
    const left = Math.max(0, Math.min(cb.left, container.width - w));
    const top = Math.max(0, Math.min(cb.top, container.height - h));
    inst.setCropBoxData({ left, top, width: w, height: h });
  };

  const api = useMemo<ImageCropperApi>(
    () => ({
      exportCroppedBlob: () =>
        new Promise<Blob>((resolve, reject) => {
          const inst = cropperInstanceRef.current;
          if (!inst) return reject(new Error("Cropper not ready"));
          const canvas = inst.getCroppedCanvas();
          if (!canvas) return reject(new Error("No cropped canvas"));
          canvas.toBlob((blob) => {
            if (!blob)
              return reject(new Error("Failed to export cropped image"));
            resolve(blob);
          }, "image/png");
        }),
      rotate: (deg) => {
        const inst = cropperInstanceRef.current;
        if (!inst) return;

        // Cropper.js may auto-adjust canvas after rotation.
        // After rotate, re-sync canvas/crop-box to the container size.
        inst.rotate(deg);
        requestAnimationFrame(() => {
          try {
            syncCropperToContainer(inst);
          } catch {
            // Best-effort: some states may reject restoring, ignore.
          }
        });
      },
      flipHorizontal: () => {
        const inst = cropperInstanceRef.current;
        if (!inst) return;
        const img = inst.getImageData();
        const current = typeof img.scaleX === "number" ? img.scaleX : 1;
        const next = current === -1 ? 1 : -1;
        inst.scaleX(next);
      },
      resetAll: () => {
        cropperInstanceRef.current?.reset();
      },
      resetCropToFullImage: () => {
        const inst = cropperInstanceRef.current;
        if (!inst) return;
        try {
          const canvas = inst.getCanvasData();
          if (!canvas?.width || !canvas?.height) return;

          // Crop box coordinates are in the container coordinate space.
          // Setting it to match the canvas ensures "full image" even when
          // the source aspect ratio/rotation/zoom differs.
          inst.setCropBoxData({
            left: canvas.left,
            top: canvas.top,
            width: canvas.width,
            height: canvas.height,
          });
        } catch {
          // ignore
        }
      },
    }),
    [],
  );

  useEffect(() => {
    if (!ready) return;
    onApiReady?.(api);
  }, [api, onApiReady, ready]);

  useEffect(() => {
    const el = containerRef.current;
    const inst = cropperInstanceRef.current;
    if (!el || !inst) return;

    // When the container resizes (history open/close, window resize, split drag),
    // re-sync canvas + crop box to avoid visual glitches.
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          syncCropperToContainer(inst);
        } catch {
          // ignore
        }
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready, src]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-secondary/30"
    >
      <Cropper
        style={{ height: "100%", width: "100%" }}
        src={src}
        aspectRatio={NaN}
        viewMode={1}
        background={false}
        guides
        autoCropArea={1}
        dragMode={disabled ? "none" : "crop"}
        movable={!disabled}
        scalable={!disabled}
        zoomable={!disabled}
        rotatable={!disabled}
        checkOrientation={true}
        responsive
        onInitialized={(instance) => {
          cropperInstanceRef.current = instance;
          setReady(true);
        }}
      />
    </div>
  );
};

export default ImageCropper;
