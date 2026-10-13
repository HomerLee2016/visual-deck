import type { Pt } from './types';

const TAU = Math.PI * 2;
export const norm = (a: number) => ((a % TAU) + TAU) % TAU;

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  cx: number;
  cy: number;
  r: number;
  /** Angle of the start point and the end point (radians). */
  ta: number;
  tb: number;
  /** Direction to travel from `ta` to `tb` so the arc passes through `m` (canvas semantics). */
  anticlockwise: boolean;
}

/** Circle through three points, with the arc direction a -> m -> b. Null if collinear. */
export function circle3(a: Pt, b: Pt, m: Pt): Circle | null {
  const d = 2 * (a.x * (b.y - m.y) + b.x * (m.y - a.y) + m.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const m2 = m.x * m.x + m.y * m.y;
  const cx = (a2 * (b.y - m.y) + b2 * (m.y - a.y) + m2 * (a.y - b.y)) / d;
  const cy = (a2 * (m.x - b.x) + b2 * (a.x - m.x) + m2 * (b.x - a.x)) / d;
  const ta = Math.atan2(a.y - cy, a.x - cx);
  const tb = Math.atan2(b.y - cy, b.x - cx);
  const tm = Math.atan2(m.y - cy, m.x - cx);
  const clockwise = norm(tm - ta) < norm(tb - ta);
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy), ta, tb, anticlockwise: !clockwise };
}

/** Distance from `p` to the segment `a`-`b`. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
