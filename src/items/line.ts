import type { LineItem, Pt, Style } from '../types';
import { defineShape, num } from './shape';

/** A two-point line; also the fallback while a curve or arc tool is still missing points. */
export function lineFrom(pts: Pt[], style: Style, id: string): LineItem | null {
  if (pts.length < 2) return null;
  return { kind: 'line', id, a: pts[0], b: pts[1], style };
}

export const lineType = defineShape<LineItem>({
  outline: (it) => [it.a, it.b],
  trace(ctx, it) {
    ctx.moveTo(it.a.x, it.a.y);
    ctx.lineTo(it.b.x, it.b.y);
  },
  pathData: (it) => `M${num(it.a.x)} ${num(it.a.y)} L${num(it.b.x)} ${num(it.b.y)}`,
  mapPoints: (it, fn) => ({ ...it, a: fn(it.a), b: fn(it.b) }),
  handles: (it) => [it.a, it.b],
  clicks: { needed: 2, build: lineFrom },
});
