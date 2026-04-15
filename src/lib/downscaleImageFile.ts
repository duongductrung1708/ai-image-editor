export type DownscaleOptions = {
  /** Giới hạn cạnh dài nhất (px). */
  maxSidePx?: number;
  /** Chất lượng JPEG/WebP (0..1). */
  quality?: number;
  /** Định dạng output ưu tiên. */
  outputMimeType?: "image/jpeg" | "image/png" | "image/webp";
};

function pickOutputMimeType(input: File, preferred?: DownscaleOptions["outputMimeType"]) {
  if (preferred) return preferred;
  const t = (input.type || "").toLowerCase();
  if (t.includes("png")) return "image/png";
  // Với scan văn bản, JPEG thường nhẹ hơn nhiều
  return "image/jpeg";
}

/**
 * Downscale ảnh trước khi OCR để tránh Edge Function bị timeout / resource limit.
 * Trả lại File mới; nếu không cần resize hoặc lỗi thì trả file gốc.
 */
export async function downscaleImageFile(
  file: File,
  opts: DownscaleOptions = {},
): Promise<File> {
  const maxSidePx = Math.max(256, Math.round(opts.maxSidePx ?? 2000));
  const quality = Math.min(0.95, Math.max(0.4, opts.quality ?? 0.82));
  const outType = pickOutputMimeType(file, opts.outputMimeType);

  try {
    const blobUrl = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = blobUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
      });

      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return file;

      const scale = Math.min(1, maxSidePx / Math.max(w, h));
      if (scale >= 1) return file;

      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, tw, th);

      const outBlob: Blob | null = await new Promise((resolve) => {
        canvas.toBlob(resolve, outType, outType === "image/png" ? undefined : quality);
      });
      if (!outBlob) return file;

      const nameBase = file.name.replace(/\.(png|jpg|jpeg|webp)$/i, "");
      const ext =
        outType === "image/png" ? "png" : outType === "image/webp" ? "webp" : "jpg";
      return new File([outBlob], `${nameBase}_scaled.${ext}`, { type: outType });
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch {
    return file;
  }
}

