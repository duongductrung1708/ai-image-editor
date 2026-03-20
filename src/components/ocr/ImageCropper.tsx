import { useEffect, useMemo, useRef, useState } from "react";
import Cropper from "react-cropper";
import type CropperJS from "cropperjs";
import "@/styles/cropperjs.css";

export type ImageCropperApi = {
  exportCroppedBlob: () => Promise<Blob>;
  rotate: (deg: number) => void;
  reset: () => void;
};

interface ImageCropperProps {
  src: string;
  disabled?: boolean;
  onApiReady?: (api: ImageCropperApi) => void;
}

const ImageCropper = ({ src, disabled = false, onApiReady }: ImageCropperProps) => {
  const [ready, setReady] = useState(false);
  const cropperInstanceRef = useRef<CropperJS | null>(null);

  const api = useMemo<ImageCropperApi>(
    () => ({
      exportCroppedBlob: () =>
        new Promise<Blob>((resolve, reject) => {
          const inst = cropperInstanceRef.current;
          if (!inst) return reject(new Error("Cropper not ready"));
          const canvas = inst.getCroppedCanvas();
          if (!canvas) return reject(new Error("No cropped canvas"));
          canvas.toBlob((blob) => {
            if (!blob) return reject(new Error("Failed to export cropped image"));
            resolve(blob);
          }, "image/png");
        }),
      rotate: (deg) => {
        cropperInstanceRef.current?.rotate(deg);
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

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-secondary/30">
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

