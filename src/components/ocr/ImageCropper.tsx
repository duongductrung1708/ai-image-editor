import { useEffect, useMemo, useRef, useState } from "react";
import Cropper from "react-cropper";
import type CropperJS from "cropperjs";
import "@/styles/cropperjs.css";

export type ImageCropperApi = {
  exportCroppedBlob: () => Promise<Blob>;
  rotate: (deg: number) => void;
  flipHorizontal: () => void;
  reset: () => void;
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

        // Cropper.js may auto-adjust canvas after rotation (appears like zoom-in / shifted).
        // Re-fit the image to the container WITHOUT resetting rotation.
        const cropBox = inst.getCropBoxData();
        inst.rotate(deg);
        requestAnimationFrame(() => {
          try {
            const maybe = inst as unknown as { resize?: () => void };
            maybe.resize?.();

            const container = inst.getContainerData();
            const image = inst.getImageData();
            const angle = (((image.rotate ?? 0) % 360) + 360) % 360;
            const rotated = angle === 90 || angle === 270;

            const naturalW = rotated ? image.naturalHeight : image.naturalWidth;
            const naturalH = rotated ? image.naturalWidth : image.naturalHeight;
            if (!naturalW || !naturalH) return;

            // Fit to container while preserving aspect ratio.
            const fitRatio = Math.min(container.width / naturalW, container.height / naturalH);
            if (Number.isFinite(fitRatio) && fitRatio > 0) {
              inst.zoomTo(fitRatio);
              const canvasW = naturalW * fitRatio;
              const canvasH = naturalH * fitRatio;
              inst.setCanvasData({
                left: (container.width - canvasW) / 2,
                top: (container.height - canvasH) / 2,
                width: canvasW,
                height: canvasH,
              });
            }

            // Best-effort restore crop box position/size.
            inst.setCropBoxData(cropBox);
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
      reset: () => {
        cropperInstanceRef.current?.reset();
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

    // Cropper.js sometimes does not react to parent resizes (e.g. when a split
    // panel is dragged). Force a best-effort resize to keep canvas in sync.
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        const maybe = inst as unknown as { resize?: () => void };
        maybe.resize?.();
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
