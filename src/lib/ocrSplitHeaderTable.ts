function splitTwoColumns(line: string): { left: string; right: string } | null {
  const raw = line.replace(/\t/g, "    ");
  if (!raw.trim()) return null;
  if (raw.trimStart().startsWith("|")) return null; // already a markdown table row
  if (raw.trimStart().startsWith("<")) return null; // already HTML

  // Find the longest whitespace run (acts like a visual column gutter).
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== " ") continue;
    let j = i;
    while (j < raw.length && raw[j] === " ") j += 1;
    const len = j - i;
    if (len >= 4 && len > bestLen) {
      bestStart = i;
      bestLen = len;
    }
    i = j;
  }

  if (bestStart === -1) return null;
  const left = raw.slice(0, bestStart).trim();
  const right = raw.slice(bestStart + bestLen).trim();
  if (!left || !right) return null;

  return { left, right };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Auto-format "2-side header" lines (left/right) into a split table.
 *
 * It looks only at the top of the document, and only applies when it finds
 * at least 2 lines with a clear whitespace gutter.
 *
 * Output uses TipTap's `table[data-layout="split"]` styles (borderless).
 */
export function formatTopSplitHeaderAsTable(markdownOrHtml: string): string {
  const text = (markdownOrHtml || "").replace(/\r\n/g, "\n");
  if (!text.trim()) return text;

  const lines = text.split("\n");
  const scanMax = Math.min(18, lines.length);

  // Stop scanning once we reach a real paragraph body.
  let stopAt = scanMax;
  for (let i = 0; i < scanMax; i += 1) {
    const t = lines[i].trim();
    if (!t) continue;
    // If OCR already produced body HTML paragraphs early, avoid rewriting.
    if (t.startsWith("<p") || t.startsWith("<table")) {
      return text;
    }
    // Heuristic: body paragraphs tend to be long and have punctuation.
    if (t.length > 120 || /[.?!;:]\s/.test(t)) {
      stopAt = i;
      break;
    }
  }

  const candidates: Array<{
    index: number;
    left: string;
    right: string;
  }> = [];

  for (let i = 0; i < stopAt; i += 1) {
    const res = splitTwoColumns(lines[i] || "");
    if (res) candidates.push({ index: i, left: res.left, right: res.right });
  }

  if (candidates.length < 2) return text;

  const firstIdx = candidates[0].index;
  const lastIdx = candidates[candidates.length - 1].index;

  // Only rewrite if the split block is reasonably compact near top.
  if (lastIdx - firstIdx > 10) return text;

  const tableRows = candidates
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.left)}</td><td>${escapeHtml(c.right)}</td></tr>`,
    )
    .join("");

  const table = `<table data-layout="split"><tbody>${tableRows}</tbody></table>`;

  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (i === firstIdx) out.push(table);
    if (i >= firstIdx && i <= lastIdx) {
      // Skip lines that were consumed by the split header.
      if (candidates.some((c) => c.index === i)) continue;
    }
    out.push(lines[i]);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

