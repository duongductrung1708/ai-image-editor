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
    .replace(/[`*_#|[\](){}]/g, "")
    .replace(/[.,;:!?…""''«»"\-–—]/g, "")
    .trim();
}

/** Character bigrams for Dice coefficient. */
function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2);
    m.set(bg, (m.get(bg) || 0) + 1);
  }
  return m;
}

/** Dice coefficient on character bigrams – good for fuzzy Vietnamese matching. */
export function diceCoefficient(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) {
    return a === b ? 1 : 0;
  }
  const bgA = bigrams(a);
  const bgB = bigrams(b);
  let intersection = 0;
  let sizeA = 0;
  let sizeB = 0;
  for (const [k, v] of bgA) {
    sizeA += v;
    intersection += Math.min(v, bgB.get(k) || 0);
  }
  for (const v of bgB.values()) sizeB += v;
  return (2 * intersection) / (sizeA + sizeB);
}

/**
 * Find bbox indices that best match the current markdown block text.
 * Uses multiple strategies: exact substring, token overlap, and bigram Dice.
 */
export function findMatchingBoxIndices(
  blockText: string,
  boxes: readonly BoxPercent[],
): number[] {
  const norm = normalizeForMatch(blockText);
  if (!norm || norm.length < 2) return [];

  type Scored = { index: number; score: number };
  const scored: Scored[] = [];

  const blockWords = new Set(norm.split(/\s+/).filter((w) => w.length > 1));

  boxes.forEach((box, index) => {
    const bt = normalizeForMatch(box.text || "");
    if (!bt || bt.length < 1) return;

    let score = 0;

    // Strategy 1: exact substring containment
    if (norm.includes(bt)) {
      score = Math.max(
        score,
        0.6 + 0.4 * (bt.length / Math.max(norm.length, 1)),
      );
    } else if (bt.includes(norm)) {
      score = Math.max(
        score,
        0.55 + 0.4 * (norm.length / Math.max(bt.length, 1)),
      );
    }

    // Strategy 2: token overlap (Jaccard-like)
    if (score < 0.5) {
      const boxWords = bt.split(/\s+/).filter((w) => w.length > 1);
      if (boxWords.length > 0) {
        let inter = 0;
        for (const w of boxWords) {
          if (blockWords.has(w)) inter += 1;
        }
        const tokenScore = inter / boxWords.length;
        // Weight by how many box words matched
        score = Math.max(score, tokenScore * 0.9);
      }
    }

    // Strategy 3: Dice coefficient on character bigrams (fuzzy)
    if (score < 0.4) {
      const dice = diceCoefficient(norm, bt);
      score = Math.max(score, dice * 0.85);
    }

    // Strategy 4: for single short words, check if block contains the word
    if (score < 0.3 && bt.length >= 2 && !bt.includes(" ")) {
      const words = norm.split(/\s+/);
      if (words.some((w) => w === bt || w.includes(bt) || bt.includes(w))) {
        score = Math.max(score, 0.35);
      }
    }

    if (score >= 0.15) scored.push({ index, score });
  });

  if (scored.length === 0) return [];

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].score;
  return scored.filter((s) => s.score >= best * 0.6).map((s) => s.index);
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

/** Fuzzy similarity after the same normalization as bbox matching (0–1). */
export function textSimilarityNormalized(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na.length || !nb.length) return 0;
  return diceCoefficient(na, nb);
}
