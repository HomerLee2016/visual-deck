import { circle3, norm } from '../math';
import type { ArcItem, Pt } from '../types';
import { lineFrom } from './line';
import { defineShape, num } from './shape';

const TAU = Math.PI * 2;

function flattenArc(it: ArcItem): Pt[] {
  const c = circle3(it.a, it.b, it.m);
  if (!c) return [it.a, it.b];
  const sweep = c.anticlockwise ? -norm(c.ta - c.tb) : norm(c.tb - c.ta);
  const n = Math.max(8, Math.ceil(Math.abs(sweep) / (TAU / 64)));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = c.ta + (sweep * i) / n;
    pts.push({ x: c.cx + c.r * Math.cos(t), y: c.cy + c.r * Math.sin(t) });
  }
  return pts;
}

export const arcType = defineShape<ArcItem>({
  outline: flattenArc,
  trace(ctx, it) {
    ctx.moveTo(it.a.x, it.a.y);
    const c = circle3(it.a, it.b, it.m);
    if (c) ctx.arc(c.cx, c.cy, c.r, c.ta, c.tb, c.anticlockwise);
    else ctx.lineTo(it.b.x, it.b.y);
  },
  pathData(it) {
    const start = `M${num(it.a.x)} ${num(it.a.y)}`;
    const end = `${num(it.b.x)} ${num(it.b.y)}`;
    const c = circle3(it.a, it.b, it.m);
    if (!c) return `${start} L${end}`;
    // Same direction rules as the canvas arc in draw: sweep-flag 1 = increasing angle.
    const span = c.anticlockwise ? norm(c.ta - c.tb) : norm(c.tb - c.ta);
    const largeArc = span > Math.PI ? 1 : 0;
    const sweep = c.anticlockwise ? 0 : 1;
    return `${start} A${num(c.r)} ${num(c.r)} 0 ${largeArc} ${sweep} ${end}`;
  },
  mapPoints: (it, fn) => ({ ...it, a: fn(it.a), b: fn(it.b), m: fn(it.m) }),
  handles: (it) => [it.a, it.b, it.m],
  clicks: {
    needed: 3,
    build: (pts, style, id) =>
      pts.length >= 3 ? { kind: 'arc', id, a: pts[0], b: pts[1], m: pts[2], style } : lineFrom(pts, style, id),
  },
});
