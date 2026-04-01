export type NormalizedCropRect = {
  // Normalized coordinates relative to the image size: [0..1]
  x: number;
  y: number;
  width: number;
  height: number;
};

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

async function loadImageFromFile(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    // Wait for decode so we can rely on naturalWidth/naturalHeight.
    if (!img.decode) {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to load image"));
      });
    } else {
      await img.decode();
    }
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Failed to export image"));
        resolve(blob);
      },
      mimeType,
      0.92,
    );
  });
}

export async function rotateFile(
  file: File,
  angleDegrees: number,
): Promise<File> {
  const angle = angleDegrees % 360;
  const shouldSwap = Math.abs(angle) === 90 || Math.abs(angle) === 270;

  const img = await loadImageFromFile(file);
  const inW = img.naturalWidth;
  const inH = img.naturalHeight;

  const outW = shouldSwap ? inH : inW;
  const outH = shouldSwap ? inW : inH;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context not available");

  // Rotate around center.
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(img, -inW / 2, -inH / 2);

  const blob = await canvasToBlob(canvas, "image/png");
  return new File([blob], `${file.name.replace(/\.[^/.]+$/, "")}_rotated.png`, {
    type: "image/png",
  });
}

export async function enhanceFile(
  file: File,
  options: {
    contrast?: number;
    brightness?: number;
    sharpenPass?: number;
  } = {},
): Promise<File> {
  const { contrast = 1.25, brightness = 1.03, sharpenPass = 0 } = options;

  const img = await loadImageFromFile(file);
  const inW = img.naturalWidth;
  const inH = img.naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = inW;
  canvas.height = inH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context not available");

  // Simple enhancement: contrast/brightness.
  // Note: Canvas doesn't provide a real "sharpen" filter everywhere; sharpenPass
  // is implemented as a couple extra draw passes.
  ctx.filter = `contrast(${contrast}) brightness(${brightness})`;
  ctx.drawImage(img, 0, 0);

  if (sharpenPass > 0) {
    for (let i = 0; i < sharpenPass; i += 1) {
      ctx.filter = `contrast(${contrast + 0.1}) brightness(${brightness})`;
      ctx.drawImage(canvas, 0, 0);
    }
  }

  const blob = await canvasToBlob(canvas, "image/png");
  return new File(
    [blob],
    `${file.name.replace(/\.[^/.]+$/, "")}_enhanced.png`,
    {
      type: "image/png",
    },
  );
}

export async function cropFile(
  file: File,
  crop: NormalizedCropRect,
): Promise<File> {
  const img = await loadImageFromFile(file);
  const inW = img.naturalWidth;
  const inH = img.naturalHeight;

  const cx = clamp01(crop.x);
  const cy = clamp01(crop.y);
  const cw = clamp01(crop.width);
  const ch = clamp01(crop.height);

  const sx = Math.round(cx * inW);
  const sy = Math.round(cy * inH);
  const sw = Math.max(1, Math.round(cw * inW));
  const sh = Math.max(1, Math.round(ch * inH));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context not available");

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob = await canvasToBlob(canvas, "image/png");
  return new File([blob], `${file.name.replace(/\.[^/.]+$/, "")}_crop.png`, {
    type: "image/png",
  });
}
