import type { BoundingBox } from "@/components/ImageViewer";

/**
 * Cắt vùng bbox (% trên ảnh gốc) → data URL (PNG).
 */
export function cropBoundingBoxToDataUrl(
  imageSrc: string,
  box: Pick<BoundingBox, "x" | "y" | "width" | "height">,
  mimeType = "image/png",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const sx = (box.x / 100) * w;
        const sy = (box.y / 100) * h;
        const sw = (box.width / 100) * w;
        const sh = (box.height / 100) * h;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sw));
        canvas.height = Math.max(1, Math.round(sh));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not available"));
          return;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(mimeType));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = imageSrc;
  });
}
