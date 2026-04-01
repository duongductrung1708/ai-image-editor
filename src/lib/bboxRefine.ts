/**
 * Hậu xử lý tọa độ bbox (% ảnh): padding nhẹ, clamp trong khung, sửa kích thước âm.
 * Giúp ô bao ôm sát chữ hơn trên UI và bù sai số nhỏ từ model.
 */
export function refineBBoxGeometry(
  x: number,
  y: number,
  width: number,
  height: number,
  options?: { paddingPct?: number },
): { x: number; y: number; width: number; height: number } {
  const pad = Math.min(0.5, Math.max(0, options?.paddingPct ?? 0.2));

  let nx = x;
  let ny = y;
  let nw = width;
  let nh = height;

  if (nw < 0) {
    nx += nw;
    nw = -nw;
  }
  if (nh < 0) {
    ny += nh;
    nh = -nh;
  }

  nx = Math.max(0, nx - pad);
  ny = Math.max(0, ny - pad);
  nw = nw + 2 * pad;
  nh = nh + 2 * pad;

  if (nx + nw > 100) nw = Math.max(0, 100 - nx);
  if (ny + nh > 100) nh = Math.max(0, 100 - ny);

  nx = Math.max(0, Math.min(100, nx));
  ny = Math.max(0, Math.min(100, ny));
  nw = Math.max(0, Math.min(100 - nx, nw));
  nh = Math.max(0, Math.min(100 - ny, nh));

  const MIN_W = 0.35;
  const MIN_H = 0.35;
  if (nw > 0 && nw < MIN_W) {
    const cx = nx + nw / 2;
    nx = Math.max(0, cx - MIN_W / 2);
    nw = Math.min(MIN_W, 100 - nx);
  }
  if (nh > 0 && nh < MIN_H) {
    const cy = ny + nh / 2;
    ny = Math.max(0, cy - MIN_H / 2);
    nh = Math.min(MIN_H, 100 - ny);
  }

  return { x: nx, y: ny, width: nw, height: nh };
}
