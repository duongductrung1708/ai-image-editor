import type { BoundingBox } from "@/components/ImageViewer";

function normalizeTextKey(input: string): string {
  return (input || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim()
    .toLowerCase();
}

function isValidFontSizePx(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Best-effort: inject font-size into existing OCR HTML paragraphs.
 *
 * - Matches <p> by textContent ↔ block.text (case/space-insensitive).
 * - If found, adds `data-font-size-px` and merges `font-size: Npx` into style.
 *
 * Only runs in browser (needs DOMParser). Safe to call; returns original on failure.
 */
export function applyOcrFontSizesToHtml(
  html: string,
  blocks: BoundingBox[],
): string {
  const trimmed = (html || "").trim();
  if (!trimmed.startsWith("<")) return html;
  if (!Array.isArray(blocks) || blocks.length === 0) return html;

  const map = new Map<string, number>();
  for (const b of blocks) {
    if (!b || b.kind === "figure" || b.kind === "stamp" || b.kind === "signature")
      continue;
    if (!isValidFontSizePx(b.fontSizePx)) continue;
    const key = normalizeTextKey(b.text || "");
    if (!key) continue;
    // Keep first occurrence (stable)
    if (!map.has(key)) map.set(key, Math.round(b.fontSizePx));
  }
  if (map.size === 0) return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, "text/html");
    const ps = Array.from(doc.querySelectorAll("p"));
    if (ps.length === 0) return html;

    for (const p of ps) {
      const key = normalizeTextKey(p.textContent || "");
      if (!key) continue;
      const size = map.get(key);
      if (!size) continue;

      p.setAttribute("data-font-size-px", String(size));

      const existing = (p.getAttribute("style") || "").trim();
      const nextStyle = existing
        ? `${existing.replace(/;?\s*$/, "; ")}font-size: ${size}px`
        : `font-size: ${size}px`;
      p.setAttribute("style", nextStyle);

      // TipTap's FontSize extension applies on textStyle marks.
      // Wrapping paragraph content in a span with font-size ensures it renders even if
      // paragraph-level styles are normalized by extensions.
      const alreadyWrapped =
        p.querySelector("span[data-ocr-fontsize]") instanceof HTMLElement;
      if (!alreadyWrapped) {
        const wrapper = doc.createElement("span");
        wrapper.setAttribute("data-ocr-fontsize", "1");
        wrapper.style.fontSize = `${size}px`;
        while (p.firstChild) wrapper.appendChild(p.firstChild);
        p.appendChild(wrapper);
      }
    }

    return doc.body.innerHTML || html;
  } catch {
    return html;
  }
}

function mapFamilyGroupToCssFontFamily(group: string): string | null {
  switch ((group || "").toLowerCase()) {
    case "sans":
      // Prefer Vietnamese-friendly sans (already in deps), then common fallbacks
      return `"Be Vietnam Pro", Inter, Arial, sans-serif`;
    case "serif":
      return `"Times New Roman", Times, serif`;
    case "mono":
      return `"Courier New", Courier, monospace`;
    default:
      return null;
  }
}

export function applyOcrFontFamiliesToHtml(
  html: string,
  blocks: BoundingBox[],
): string {
  const trimmed = (html || "").trim();
  if (!trimmed.startsWith("<")) return html;
  if (!Array.isArray(blocks) || blocks.length === 0) return html;

  const map = new Map<string, string>();
  for (const b of blocks) {
    if (!b || b.kind === "figure" || b.kind === "stamp" || b.kind === "signature")
      continue;
    const css = mapFamilyGroupToCssFontFamily(String(b.fontFamily || ""));
    if (!css) continue;
    const key = normalizeTextKey(b.text || "");
    if (!key) continue;
    if (!map.has(key)) map.set(key, css);
  }
  if (map.size === 0) return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, "text/html");
    const ps = Array.from(doc.querySelectorAll("p"));
    if (ps.length === 0) return html;

    for (const p of ps) {
      const key = normalizeTextKey(p.textContent || "");
      if (!key) continue;
      const family = map.get(key);
      if (!family) continue;

      p.setAttribute("data-font-family", family);
      const existing = (p.getAttribute("style") || "").trim();
      const nextStyle = existing
        ? `${existing.replace(/;?\s*$/, "; ")}font-family: ${family}`
        : `font-family: ${family}`;
      p.setAttribute("style", nextStyle);
    }

    return doc.body.innerHTML || html;
  } catch {
    return html;
  }
}

