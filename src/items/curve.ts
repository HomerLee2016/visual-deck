import type { CurveItem, Pt, Style } from '../types';
import { lineFrom } from './line';
import { defineShape, num } from './shape';

function flattenCurve(it: CurveItem, n = 48): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const k0 = u * u * u;
    const k1 = 3 * u * u * t;
    const k2 = 3 * u * t * t;
    const k3 = t * t * t;
    pts.push({
      x: k0 * it.a.x + k1 * it.c1.x + k2 * it.c2.x + k3 * it.b.x,
      y: k0 * it.a.y + k1 * it.c1.y + k2 * it.c2.y + k3 * it.b.y,
    });
  }
  return pts;
}

export const curveType = defineShape<CurveItem>({
  outline: (it) => flattenCurve(it),
  trace(ctx, it) {
    ctx.moveTo(it.a.x, it.a.y);
    ctx.bezierCurveTo(it.c1.x, it.c1.y, it.c2.x, it.c2.y, it.b.x, it.b.y);
  },
  pathData: (it) =>
    `M${num(it.a.x)} ${num(it.a.y)} C${num(it.c1.x)} ${num(it.c1.y)} ${num(it.c2.x)} ${num(it.c2.y)} ${num(it.b.x)} ${num(it.b.y)}`,
  mapPoints: (it, fn) => ({ ...it, a: fn(it.a), b: fn(it.b), c1: fn(it.c1), c2: fn(it.c2) }),
  handles: (it) => [it.a, it.b, it.c1, it.c2],
  clicks: {
    needed: 4,
    build: (pts: Pt[], style: Style, id: string) =>
      pts.length >= 3
        ? { kind: 'curve', id, a: pts[0], b: pts[1], c1: pts[2], c2: pts[3] ?? pts[2], style }
        : lineFrom(pts, style, id),
  },
});
