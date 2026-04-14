import type { BoundingBox } from "@/components/ImageViewer";
import {
  isVisualBboxKind,
  parseBboxKindFromApi,
  visualBboxAlt,
} from "@/lib/bboxKinds";
import { refineBBoxGeometry } from "@/lib/bboxRefine";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Gán id + tinh chỉnh tọa độ.
 * `figure` / `stamp` / `signature` chỉ khi API/model gửi rõ (hoặc placeholder [CON DẤU]/[CHỮ KÝ]).
 */
export function normalizeBoundingBoxes(
  blocks: BoundingBox[],
  pageIndex?: number,
): BoundingBox[] {
  const prefix = pageIndex !== undefined ? `p${pageIndex}-` : "";
  return blocks.map((b, i) => {
    const id =
      b.id?.trim() && b.id.trim().length > 0
        ? b.id.trim()
        : `${prefix}bbox-${i}`;
    const geo = refineBBoxGeometry(
      Number(b.x) || 0,
      Number(b.y) || 0,
      Number(b.width) || 0,
      Number(b.height) || 0,
    );
    const merged = { ...b, ...geo };
    const kind = parseBboxKindFromApi(b.kind, merged.text);
    return { ...merged, id, kind };
  });
}

export type BuildBlockHtmlOptions = {
  /** data URL đã crop theo bbox id (figure / con dấu / chữ ký). */
  cropUrls?: Partial<Record<string, string>>;
};

/**
 * Một đoạn HTML = một bbox: `<p data-bbox-id>…</p>`; figure/stamp/signature → `<img>` trong cùng khối.
 */
export function buildOcrHtmlFromBlocks(
  blocks: BoundingBox[],
  options: BuildBlockHtmlOptions = {},
): string {
  const { cropUrls = {} } = options;
  const parts: string[] = [];

  for (const b of blocks) {
    const id = b.id ?? `bbox-${parts.length}`;
    const kind = parseBboxKindFromApi(b.kind, b.text);
    const crop = cropUrls[id];
    const kindAttr = kind;
    const fontSizeAttr =
      typeof b.fontSizePx === "number" && b.fontSizePx > 0
        ? ` data-font-size-px="${escapeHtml(String(Math.round(b.fontSizePx)))}"`
        : "";
    const alt = visualBboxAlt(kind) || "Hình";

    if (isVisualBboxKind(kind) && crop) {
      parts.push(
        `<p data-bbox-id="${escapeHtml(id)}" data-bbox-kind="${escapeHtml(kindAttr)}"${fontSizeAttr}><img src="${escapeHtml(crop)}" alt="${escapeHtml(alt)}" class="max-w-full rounded-md border border-border" /></p>`,
      );
      continue;
    }

    const t = (b.text ?? "").trim();
    if (isVisualBboxKind(kind) && !crop) {
      parts.push(
        `<p data-bbox-id="${escapeHtml(id)}" data-bbox-kind="${escapeHtml(kindAttr)}"${fontSizeAttr}><span class="text-muted-foreground text-sm">(Không tải được ảnh vùng)</span></p>`,
      );
      continue;
    }

    const inner = t ? escapeHtml(t).replace(/\n/g, "<br/>") : "<br/>";
    parts.push(
      `<p data-bbox-id="${escapeHtml(id)}" data-bbox-kind="${escapeHtml(kindAttr)}"${fontSizeAttr}>${inner}</p>`,
    );
  }

  return parts.join("");
}
