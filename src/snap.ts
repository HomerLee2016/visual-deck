import type { Rect } from './math';

/** Guide positions, in document units, for each axis. */
export interface Guides {
  x: number[];
  y: number[];
}

/** Grid size in document units, or null when the grid is off. */
export type Grid = number | null;

/**
 * The offset that snaps a box's left, centre or right edge (for x) or top,
 * middle or bottom edge (for y) onto a grid line or guide within `tol`.
 * Returns 0 when nothing is close enough. The nearest target wins.
 */
export function snapOffset(candidates: number[], guides: number[], grid: Grid, tol: number): number {
  let best: number | null = null;
  for (const c of candidates) {
    const targets = grid ? [...guides, Math.round(c / grid) * grid] : guides;
    for (const t of targets) {
      const d = t - c;
      if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best ?? 0;
}

/** Offset (dx, dy) that snaps a box to the grid and guides. */
export function snapBox(box: Rect, guides: Guides, grid: Grid, tol: number): { dx: number; dy: number } {
  const xs = [box.x, box.x + box.w / 2, box.x + box.w];
  const ys = [box.y, box.y + box.h / 2, box.y + box.h];
  return { dx: snapOffset(xs, guides.x, grid, tol), dy: snapOffset(ys, guides.y, grid, tol) };
}
