import type { Rect } from './math';
import type { Pt } from './types';

/** A 2D affine matrix [a, b, c, d, e, f], in the same order as Canvas and SVG `matrix()`. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export const isIdentity = (m: Matrix) => m.every((v, i) => v === IDENTITY[i]);

/** `m` applied after `n`: `multiply(m, n)` maps a point by `n` first, then `m`. */
export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const [A, B, C, D, E, F] = n;
  return [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
}

export const translation = (dx: number, dy: number): Matrix => [1, 0, 0, 1, dx, dy];

export function apply(m: Matrix, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Inverse matrix, or null when `m` collapses the plane (zero determinant). */
export function invert(m: Matrix): Matrix | null {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** Average linear scale of `m` (square root of the determinant). Used to convert screen tolerances. */
export const scaleOf = (m: Matrix) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

/** Axis-aligned box around the four transformed corners of `r`. */
export function transformRect(r: Rect, m: Matrix): Rect {
  const corners = [
    apply(m, { x: r.x, y: r.y }),
    apply(m, { x: r.x + r.w, y: r.y }),
    apply(m, { x: r.x, y: r.y + r.h }),
    apply(m, { x: r.x + r.w, y: r.y + r.h }),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

/** Map a vector (not a point) through the linear part of `m`, i.e. ignore its translation. */
export function applyLinear(m: Matrix, dx: number, dy: number): Pt {
  return { x: m[0] * dx + m[2] * dy, y: m[1] * dx + m[3] * dy };
}
