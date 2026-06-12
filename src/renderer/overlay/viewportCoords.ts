/** Viewport-percent (0–100) → overlay pixel coords. Single source of truth. */

export const CURSOR_HOTSPOT = { x: 5.5, y: 3.21 };

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function readViewportDims(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return {
    width: Math.max(1, window.innerWidth),
    height: Math.max(1, window.innerHeight),
  };
}

export function percentToPixels(
  x: number,
  y: number,
  dims = readViewportDims(),
): { x: number; y: number } {
  return {
    x: Math.round((clampPercent(x) / 100) * dims.width),
    y: Math.round((clampPercent(y) / 100) * dims.height),
  };
}

/** Cursor tip lands on target center. */
export function cursorTransform(
  percentX: number,
  percentY: number,
  dims = readViewportDims(),
  extraX = 0,
  extraY = 0,
): string {
  const { x, y } = percentToPixels(percentX, percentY, dims);
  return `translate3d(${x - CURSOR_HOTSPOT.x + extraX}px, ${y - CURSOR_HOTSPOT.y + extraY}px, 0)`;
}

/** Ring / dot center on target. */
export function centerTransform(
  percentX: number,
  percentY: number,
  dims = readViewportDims(),
): string {
  const { x, y } = percentToPixels(percentX, percentY, dims);
  return `translate3d(${x}px, ${y}px, 0)`;
}
