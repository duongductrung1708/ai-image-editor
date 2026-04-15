import type { BoundingBox } from "@/components/ImageViewer";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type LineGroup = {
  y: number;
  blocks: BoundingBox[];
};

function groupTopLines(blocks: BoundingBox[]): LineGroup[] {
  const topText = blocks
    .filter((b) => (b.kind ?? "text") === "text")
    .filter((b) => typeof b.text === "string" && b.text.trim().length > 0)
    .filter((b) => Number.isFinite(b.y))
    .filter((b) => (b.y ?? 0) <= 35) // top region
    .slice()
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));

  const groups: LineGroup[] = [];
  const Y_EPS = 2.2; // percent units

  for (const b of topText) {
    const y = b.y ?? 0;
    const last = groups[groups.length - 1];
    if (!last || Math.abs(last.y - y) > Y_EPS) {
      groups.push({ y, blocks: [b] });
    } else {
      last.blocks.push(b);
    }
  }

  for (const g of groups) {
    g.blocks.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  }

  return groups;
}

function lineToPlainText(blocks: BoundingBox[]): string {
  return blocks
    .map((b) => (b.text || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMatchingPrefix(original: string, headerLines: string[]): string {
  const srcLines = original.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  // Skip leading empty lines in original
  let i = 0;
  while (i < srcLines.length && !srcLines[i].trim()) i += 1;

  const norm = (s: string) => {
    const t = s
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[*_`#]+/g, "")
      .replace(/[\[\]]/g, "")
      .replace(/[()]/g, "")
      .replace(/[:：]/g, "")
      .trim()
      .toLowerCase();
    return t;
  };

  const isEquivalentLine = (aRaw: string, bRaw: string): boolean => {
    const a = norm(aRaw);
    const b = norm(bRaw);
    if (!a || !b) return false;
    if (a === b) return true;
    // Tolerate minor differences like extra words/tokens.
    if (a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))) {
      return true;
    }
    return false;
  };

  let h = 0;
  while (h < headerLines.length && i < srcLines.length) {
    if (isEquivalentLine(srcLines[i] || "", headerLines[h] || "")) {
      i += 1;
      h += 1;
      while (i < srcLines.length && !srcLines[i].trim()) i += 1;
      continue;
    }
    break;
  }

  for (; i < srcLines.length; i += 1) out.push(srcLines[i]);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimStart();
}

function blockInnerHtml(b: BoundingBox): string {
  let inner = escapeHtml((b.text || "").trim()).replace(/\n/g, "<br/>");
  if (b.bold) inner = `<strong>${inner}</strong>`;
  if (b.italic) inner = `<em>${inner}</em>`;
  if (b.underline) inner = `<u>${inner}</u>`;
  if (b.color) inner = `<span style="color: ${escapeHtml(b.color)}">${inner}</span>`;
  return inner || "<br/>";
}

function shouldRewriteHeader(groups: LineGroup[], original: string): boolean {
  if (groups.length < 2) return false;
  const t = original.trimStart();
  if (t.startsWith("<table") || t.startsWith("<p")) return false;
  return groups.some((g) =>
    g.blocks.some((b) => b.textAlign && b.textAlign !== "left") ||
    g.blocks.some((b) => Boolean(b.color)) ||
    g.blocks.some((b) => Boolean(b.bold) || (b.fontSizePx ?? 0) >= 22),
  );
}

function isTwoColumnLine(blocks: BoundingBox[]): boolean {
  if (blocks.length !== 2) return false;
  const left = blocks[0];
  const right = blocks[1];
  const gap = (right.x ?? 0) - ((left.x ?? 0) + (left.width ?? 0));
  return gap >= 8; // percent gap
}

function renderSplitTable(groups: LineGroup[]): string {
  const rows: string[] = [];
  for (const g of groups) {
    if (!isTwoColumnLine(g.blocks)) return "";
    const [l, r] = g.blocks;
    rows.push(
      `<tr><td>${blockInnerHtml(l)}</td><td>${blockInnerHtml(r)}</td></tr>`,
    );
  }
  return `<table data-layout="split"><tbody>${rows.join("")}</tbody></table>`;
}

function renderHeaderHtml(groups: LineGroup[]): { html: string; plainLines: string[] } {
  const plainLines: string[] = [];

  // Prefer split-table if all lines are 2-column.
  const split = renderSplitTable(groups);
  if (split) {
    for (const g of groups) plainLines.push(lineToPlainText(g.blocks));
    return { html: split, plainLines };
  }

  const parts: string[] = [];
  for (const g of groups) {
    const align =
      g.blocks.find((b) => b.textAlign && b.textAlign !== "left")?.textAlign ??
      (g.blocks.length === 1 ? g.blocks[0].textAlign : undefined);
    const fontPx = Math.max(
      ...g.blocks.map((b) => (typeof b.fontSizePx === "number" ? b.fontSizePx : 0)),
    );
    const style: string[] = [];
    if (align && align !== "left") style.push(`text-align:${align}`);
    if (fontPx >= 14) style.push(`font-size:${Math.round(fontPx)}px`);

    const inner = g.blocks.map(blockInnerHtml).join(" ");
    const plain = lineToPlainText(g.blocks);
    if (plain) plainLines.push(plain);

    parts.push(`<p style="${escapeHtml(style.join(";"))}">${inner}</p>`);
  }

  return { html: parts.join(""), plainLines };
}

/**
 * Build a styled header/title block from OCR `blocks` (align, color, bold),
 * then replace matching top lines from markdown to avoid duplication.
 */
export function applyStyledHeaderFromBlocks(opts: {
  markdown: string;
  blocks: BoundingBox[];
}): string {
  const { markdown, blocks } = opts;
  const groups = groupTopLines(blocks);
  if (!shouldRewriteHeader(groups, markdown)) return markdown;

  const top = groups.slice(0, 8); // keep it compact
  const { html, plainLines } = renderHeaderHtml(top);
  if (!html) return markdown;

  const stripped = stripMatchingPrefix(markdown, plainLines);
  const out = `${html}\n\n${stripped}`.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

