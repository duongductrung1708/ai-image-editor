import type { BoundingBox } from "@/components/ImageViewer";

/** Vùng OCR: văn bản, hình minh họa, con dấu, chữ ký. */
export type BboxRegionKind = NonNullable<BoundingBox["kind"]>;

export function isVisualBboxKind(kind: BboxRegionKind | undefined): boolean {
  return kind === "figure" || kind === "stamp" || kind === "signature";
}

/** Chuẩn hóa chuỗi kind từ API (tiếng Anh / alias). */
export function parseBboxKindFromApi(
  raw: unknown,
  textHint?: string,
): BboxRegionKind {
  const t = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  if (t === "stamp" || t === "seal") return "stamp";
  if (t === "signature" || t === "sign") return "signature";
  if (t === "figure") return "figure";
  const hint = (textHint ?? "").trim();
  if (/\[CON\s*DẤU\]/i.test(hint) || /^\[?\s*CON\s*DẤU\s*\]?$/i.test(hint)) {
    return "stamp";
  }
  if (/\[CHỮ\s*KÝ\]/i.test(hint) || /^\[?\s*CHỮ\s*KÝ\s*\]?$/i.test(hint)) {
    return "signature";
  }
  return "text";
}

export function visualBboxAlt(kind: BboxRegionKind | undefined): string {
  switch (kind) {
    case "stamp":
      return "Con dấu";
    case "signature":
      return "Chữ ký";
    case "figure":
      return "Hình";
    default:
      return "";
  }
}
