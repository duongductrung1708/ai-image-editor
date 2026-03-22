/** Bbox in image percent coords (same shape as ImageViewer BoundingBox). */
export type BoxPercent = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[`*_#|[\]()]/g, "")
    .trim();
}

/**
 * Find bbox indices that best match the current markdown block text.
 * Heuristic: substring containment, then token overlap.
 */
export function findMatchingBoxIndices(
  blockText: string,
  boxes: readonly BoxPercent[],
): number[] {
  const norm = normalizeForMatch(blockText);
  if (!norm || norm.length < 2) return [];

  type Scored = { index: number; score: number };
  const scored: Scored[] = [];

  boxes.forEach((box, index) => {
    const bt = normalizeForMatch(box.text || "");
    if (!bt || bt.length < 1) return;

    let score = 0;
    if (norm.includes(bt)) {
      score = 0.5 + 0.5 * (bt.length / Math.max(norm.length, 1));
    } else if (bt.includes(norm)) {
      score = 0.45 + 0.5 * (norm.length / Math.max(bt.length, 1));
    } else {
      const wordsA = new Set(norm.split(/\s+/).filter((w) => w.length > 1));
      const wordsB = bt.split(/\s+/).filter((w) => w.length > 1);
      if (wordsB.length === 0) return;
      let inter = 0;
      for (const w of wordsB) {
        if (wordsA.has(w)) inter += 1;
      }
      score = inter / wordsB.length;
    }

    if (score >= 0.18) scored.push({ index, score });
  });

  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].score;
  return scored
    .filter((s) => s.score >= best * 0.75)
    .map((s) => s.index);
}

export function mergeBoxRectsPercent(
  boxes: readonly BoxPercent[],
  indices: number[],
): { x: number; y: number; width: number; height: number } | null {
  const picked = indices
    .map((i) => boxes[i])
    .filter((b): b is BoxPercent => Boolean(b));
  if (picked.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxR = 0;
  let maxB = 0;
  for (const b of picked) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxR = Math.max(maxR, b.x + b.width);
    maxB = Math.max(maxB, b.y + b.height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxR - minX),
    height: Math.max(0, maxB - minY),
  };
}
