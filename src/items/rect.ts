import type { Pt, RectItem } from '../types';
import { defineShape, num } from './shape';

/** The corner radius actually drawn: never more than half the shorter side. */
const radiusOf = (it: RectItem) => Math.max(0, Math.min(it.r, it.w / 2, it.h / 2));

/** Point that makes the box from `anchor` to `p` square, keeping the drag direction. */
export function squareCorner(anchor: Pt, p: Pt): Pt {
  const side = Math.max(Math.abs(p.x - anchor.x), Math.abs(p.y - anchor.y));
  return {
    x: anchor.x + (p.x < anchor.x ? -side : side),
    y: anchor.y + (p.y < anchor.y ? -side : side),
  };
}

export const rectType = defineShape<RectItem>({
  outline(it) {
    const { x, y, w, h } = it;
    const r = radiusOf(it);
    // The outline is closed (last point repeats the first) so hit-testing sees every edge.
    if (r === 0) {
      return [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
      ];
    }
    // Sample each rounded corner so hit-testing and bounds follow the curve.
    const pts: Pt[] = [];
    const steps = 8;
    const corners = [
      { cx: x + w - r, cy: y + r, a0: -Math.PI / 2 },
      { cx: x + w - r, cy: y + h - r, a0: 0 },
      { cx: x + r, cy: y + h - r, a0: Math.PI / 2 },
      { cx: x + r, cy: y + r, a0: Math.PI },
    ];
    for (const { cx, cy, a0 } of corners) {
      for (let i = 0; i <= steps; i++) {
        const a = a0 + (Math.PI / 2) * (i / steps);
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
      }
    }
    pts.push({ ...pts[0] });
    return pts;
  },
  trace(ctx, it) {
    ctx.roundRect(it.x, it.y, it.w, it.h, radiusOf(it));
  },
  pathData(it) {
    const { x, y, w, h } = it;
    const r = radiusOf(it);
    const arc = (px: number, py: number) => `A${num(r)} ${num(r)} 0 0 1 ${num(px)} ${num(py)}`;
    return [
      `M${num(x + r)} ${num(y)}`,
      `H${num(x + w - r)}`,
      arc(x + w, y + r),
      `V${num(y + h - r)}`,
      arc(x + w - r, y + h),
      `H${num(x + r)}`,
      arc(x, y + h - r),
      `V${num(y + r)}`,
      arc(x + r, y),
      'Z',
    ].join(' ');
  },
  mapPoints(it, fn) {
    const p = fn({ x: it.x, y: it.y });
    return { ...it, x: p.x, y: p.y };
  },
  handles: (it) => [
    { x: it.x, y: it.y },
    { x: it.x + it.w, y: it.y },
    { x: it.x + it.w, y: it.y + it.h },
    { x: it.x, y: it.y + it.h },
  ],
  clicks: {
    label: 'Rectangle',
    needed: 2,
    hint: () => 'Click the opposite corner (Shift for a square)',
    build(pts, style, id, params) {
      if (pts.length < 2) return null;
      const [a, b] = pts;
      return {
        kind: 'rect',
        id,
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(a.x - b.x),
        h: Math.abs(a.y - b.y),
        r: params.radius,
        style,
      };
    },
    constrain: squareCorner,
  },
});
