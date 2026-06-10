function splitTwoColumns(line: string): { left: string; right: string } | null {
  const raw = line.replace(/\t/g, "    ");
  if (!raw.trim()) return null;
  if (raw.trimStart().startsWith("|")) return null; // already a markdown table row
  if (raw.trimStart().startsWith("<")) return null; // already HTML
  if (raw.trimStart().startsWith("#")) return null; // markdown heading
  if (raw.trimStart().startsWith("- ") || raw.trimStart().startsWith("* ")) return null;

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
  // Avoid mis-detecting normal sentences as 2-col: require both sides to be short-ish
  if (left.length > 80 || right.length > 80) return null;
  // Avoid lines that look like prose (has sentence-ending punctuation in middle)
  if (/[.?!;]\s/.test(left) || /[.?!;]\s/.test(right)) return null;

  return { left, right };
}

function escapeHtml(s: string): string {
  return s
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;");
}

type SplitRun = {
  startIdx: number;
  endIdx: number;
  rows: Array<
    | { kind: "split"; left: string; right: string; idx: number }
    | { kind: "span"; text: string; idx: number }
  >;
};

/**
 * Find all runs of consecutive 2-column lines (with optional in-between single
 * lines) anywhere in the document. A run needs at least 2 split lines to qualify.
 */
function findSplitRuns(lines: string[]): SplitRun[] {
  const runs: SplitRun[] = [];
  let i = 0;
  while (i < lines.length) {
    const split = splitTwoColumns(lines[i] || "");
    if (!split) {
      i += 1;
      continue;
    }

    // Seed a run starting at i
    const rows: SplitRun["rows"] = [
      { kind: "split", left: split.left, right: split.right, idx: i },
    ];
    let lastSplitIdx = i;
    let j = i + 1;
    let splitCount = 1;

    while (j < lines.length) {
      const line = lines[j] || "";
      const trimmed = line.trim();

      // Blank line: only allow 1 blank between split rows; if next isn't split, stop.
      if (!trimmed) {
        // Peek ahead
        let k = j + 1;
        while (k < lines.length && !(lines[k] || "").trim()) k += 1;
        const nextSplit = k < lines.length ? splitTwoColumns(lines[k] || "") : null;
        if (nextSplit && k - lastSplitIdx <= 3) {
          j = k;
          continue;
        }
        break;
      }

      // HTML / markdown structures break the run
      if (
        trimmed.startsWith("<") ||
        trimmed.startsWith("|") ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("- ") ||
        trimmed.startsWith("* ")
      ) {
        break;
      }

      const s = splitTwoColumns(line);
      if (s) {
        rows.push({ kind: "split", left: s.left, right: s.right, idx: j });
        lastSplitIdx = j;
        splitCount += 1;
        j += 1;
        continue;
      }

      // Single column line inside run: only allow if next line is also a split
      // and the line is short (caption / sub-heading), max 1-2 in a row.
      if (trimmed.length <= 100 && j - lastSplitIdx <= 2) {
        const peek = splitTwoColumns(lines[j + 1] || "") || splitTwoColumns(lines[j + 2] || "");
        if (peek) {
          rows.push({ kind: "span", text: trimmed, idx: j });
          j += 1;
          continue;
        }
      }
      break;
    }

    if (splitCount >= 2) {
      const endIdx = rows[rows.length - 1].idx;
      runs.push({ startIdx: i, endIdx, rows });
      i = endIdx + 1;
    } else {
      i += 1;
    }
  }
  return runs;
}

function renderSplitRun(run: SplitRun): string {
  const tr = run.rows
    .map((r) => {
      if (r.kind === "split") {
        return `<tr><td>${escapeHtml(r.left)}</td><td>${escapeHtml(r.right)}</td></tr>`;
      }
      return `<tr><td colspan="2">${escapeHtml(r.text)}</td></tr>`;
    })
    .join("");
  return `<table data-layout="split"><tbody>${tr}</tbody></table>`;
}

/**
 * Auto-format "2-column" line runs (left/right) into borderless split tables.
 *
 * Scans the ENTIRE document (not just the top) and converts every run of
 * consecutive 2-column lines into a `<table data-layout="split">` block.
 *
 * Preserves the original function name for backwards compatibility.
 */
export function formatTopSplitHeaderAsTable(markdownOrHtml: string): string {
  const text = (markdownOrHtml || "").replace(/\r\n/g, "\n");
  if (!text.trim()) return text;

  const lines = text.split("\n");
  const runs = findSplitRuns(lines);
  if (runs.length === 0) return text;

  // Build output replacing each run with its rendered table
  const out: string[] = [];
  let i = 0;
  let runIdx = 0;
  while (i < lines.length) {
    if (runIdx < runs.length && i === runs[runIdx].startIdx) {
      out.push(renderSplitRun(runs[runIdx]));
      i = runs[runIdx].endIdx + 1;
      runIdx += 1;
      continue;
    }
    out.push(lines[i]);
    i += 1;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}
