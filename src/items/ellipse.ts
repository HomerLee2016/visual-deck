import type { EllipseItem, Pt } from '../types';
import { squareCorner } from './rect';
import { defineShape, num } from './shape';

/** Four points on the ellipse at 45-degree steps, plus the start again, so the outline is closed. */
function sample(it: EllipseItem): Pt[] {
  const pts: Pt[] = [];
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * 2 * i) / steps;
    pts.push({ x: it.cx + it.rx * Math.cos(t), y: it.cy + it.ry * Math.sin(t) });
  }
  return pts;
}

export const ellipseType = defineShape<EllipseItem>({
  outline: sample,
  trace(ctx, it) {
    ctx.ellipse(it.cx, it.cy, it.rx, it.ry, 0, 0, Math.PI * 2);
  },
  pathData(it) {
    // Two half-ellipse arcs from the left point, back to it.
    const left = `M${num(it.cx - it.rx)} ${num(it.cy)}`;
    const mid = `${num(it.cx + it.rx)} ${num(it.cy)}`;
    return `${left} A${num(it.rx)} ${num(it.ry)} 0 1 1 ${mid} A${num(it.rx)} ${num(it.ry)} 0 1 1 ${num(it.cx - it.rx)} ${num(it.cy)} Z`;
  },
  mapPoints(it, fn) {
    const c = fn({ x: it.cx, y: it.cy });
    return { ...it, cx: c.x, cy: c.y };
  },
  handles: (it) => [
    { x: it.cx - it.rx, y: it.cy - it.ry },
    { x: it.cx + it.rx, y: it.cy - it.ry },
    { x: it.cx + it.rx, y: it.cy + it.ry },
    { x: it.cx - it.rx, y: it.cy + it.ry },
  ],
  clicks: {
    label: 'Ellipse',
    needed: 2,
    hint: () => 'Click the opposite corner of its box (Shift for a circle)',
    build(pts, style, id) {
      if (pts.length < 2) return null;
      const [a, b] = pts;
      return {
        kind: 'ellipse',
        id,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        rx: Math.abs(a.x - b.x) / 2,
        ry: Math.abs(a.y - b.y) / 2,
        style,
      };
    },
    constrain: squareCorner,
  },
});
