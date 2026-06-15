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
  return "image/jpeg";
}

function outExt(outType: string) {
  return outType === "image/png" ? "png" : outType === "image/webp" ? "webp" : "jpg";
}

// ---- Worker singleton ------------------------------------------------------
type WorkerResponse = {
  id: number;
  ok: boolean;
  blob?: Blob | null;
  error?: string;
};

let workerInstance: Worker | null = null;
let workerSeq = 0;
const pending = new Map<
  number,
  { resolve: (b: Blob | null) => void; reject: (e: Error) => void }
>();
let workerBroken = false;

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (typeof window === "undefined") return null;
  if (typeof Worker === "undefined") return null;
  if (typeof OffscreenCanvas === "undefined") return null;
  if (typeof createImageBitmap === "undefined") return null;

  if (workerInstance) return workerInstance;
  try {
    workerInstance = new Worker(
      new URL("./downscaleImageWorker.ts", import.meta.url),
      { type: "module" },
    );
    workerInstance.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.ok) entry.resolve(msg.blob ?? null);
      else entry.reject(new Error(msg.error || "worker failure"));
    };
    workerInstance.onerror = () => {
      workerBroken = true;
      for (const [, entry] of pending) entry.reject(new Error("worker error"));
      pending.clear();
      try {
        workerInstance?.terminate();
      } catch {
        /* noop */
      }
      workerInstance = null;
    };
    return workerInstance;
  } catch {
    workerBroken = true;
    return null;
  }
}

async function downscaleViaWorker(
  file: File,
  maxSidePx: number,
  quality: number,
  outType: "image/jpeg" | "image/png" | "image/webp",
): Promise<Blob | null | "unavailable"> {
  const worker = getWorker();
  if (!worker) return "unavailable";
  const buffer = await file.arrayBuffer();
  const id = ++workerSeq;
  return new Promise<Blob | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      worker.postMessage(
        { id, buffer, type: file.type, maxSidePx, quality, outType },
        [buffer],
      );
    } catch (err) {
      pending.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  }).catch(() => "unavailable" as const);
}

// ---- Main-thread fallback --------------------------------------------------
async function downscaleOnMainThread(
  file: File,
  maxSidePx: number,
  quality: number,
  outType: "image/jpeg" | "image/png" | "image/webp",
): Promise<Blob | null> {
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
    if (!w || !h) return null;
    const scale = Math.min(1, maxSidePx / Math.max(w, h));
    if (scale >= 1) return null;
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, tw, th);
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outType, outType === "image/png" ? undefined : quality);
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Downscale ảnh trước khi OCR. Mặc định chạy trên Web Worker (OffscreenCanvas)
 * để UI không bị khựng; fallback sang main thread khi browser không hỗ trợ.
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
    const viaWorker = await downscaleViaWorker(file, maxSidePx, quality, outType);
    let outBlob: Blob | null = null;
    if (viaWorker === "unavailable") {
      outBlob = await downscaleOnMainThread(file, maxSidePx, quality, outType);
    } else {
      outBlob = viaWorker;
    }
    if (!outBlob) return file;

    const nameBase = file.name.replace(/\.(png|jpg|jpeg|webp)$/i, "");
    return new File([outBlob], `${nameBase}_scaled.${outExt(outType)}`, {
      type: outType,
    });
  } catch {
    return file;
  }
}
