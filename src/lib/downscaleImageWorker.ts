/* eslint-disable no-restricted-globals */
// Web Worker: nén/resize ảnh dùng OffscreenCanvas để không block UI thread.

type WorkerRequest = {
  id: number;
  buffer: ArrayBuffer;
  type: string;
  maxSidePx: number;
  quality: number;
  outType: "image/jpeg" | "image/png" | "image/webp";
};

type WorkerResponse =
  | { id: number; ok: true; blob: Blob | null }
  | { id: number; ok: false; error: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, buffer, type, maxSidePx, quality, outType } = e.data;
  try {
    const blob = new Blob([buffer], { type });
    const bitmap = await createImageBitmap(blob);
    const w = bitmap.width;
    const h = bitmap.height;
    const scale = Math.min(1, maxSidePx / Math.max(w, h));
    if (scale >= 1) {
      bitmap.close();
      const resp: WorkerResponse = { id, ok: true, blob: null };
      (self as unknown as Worker).postMessage(resp);
      return;
    }
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = new OffscreenCanvas(tw, th);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      throw new Error("OffscreenCanvas 2D context unavailable");
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, tw, th);
    bitmap.close();
    const outBlob = await canvas.convertToBlob({
      type: outType,
      quality: outType === "image/png" ? undefined : quality,
    });
    const resp: WorkerResponse = { id, ok: true, blob: outBlob };
    (self as unknown as Worker).postMessage(resp);
  } catch (err) {
    const resp: WorkerResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(resp);
  }
};

export {};
