/** Kích thước file hiển thị (batch / preview). */
export function formatBatchFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Data URL SVG placeholder cho trang batch khi không có ảnh gốc. */
export function svgPlaceholderPage(label: string): string {
  const esc = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800"><rect fill="#f4f4f5" width="100%" height="100%"/><text x="320" y="400" text-anchor="middle" fill="#9ca3af" font-family="system-ui,sans-serif" font-size="18">${esc}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
