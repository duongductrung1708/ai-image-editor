/**
 * Heuristic: GFM pipe table has a separator row like | --- | --- |
 * (used to prefer full_text over bbox-paragraph HTML in the editor).
 */
export function looksLikeMarkdownTable(s: string): boolean {
  if (!s?.trim() || !s.includes("|")) return false;
  for (const line of s.split(/\r?\n/)) {
    const t = line.trim();
    if (/^\|(\s*:?-+:?\s*\|)+\s*$/.test(t)) return true;
  }
  return false;
}
