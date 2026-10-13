import type { Pt, PolygonItem, StarItem, Style } from '../types';
import { defineShape, num } from './shape';
import type { ClickSpec, ShapeParams } from './types';

/** Vertices of a closed polygon (or star, when `inner` is given), first vertex at angle `rot`. */
export function polygonVertices(cx: number, cy: number, r: number, sides: number, rot: number, inner?: number): Pt[] {
  const n = Math.max(3, Math.round(sides));
  const count = inner === undefined ? n : n * 2;
  const pts: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = rot + (Math.PI * 2 * i) / count;
    const rad = inner === undefined || i % 2 === 0 ? r : r * inner;
    pts.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
  }
  return pts;
}

/** Path data for a closed polyline of points. */
export const closedPath = (pts: Pt[]) =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p.x)} ${num(p.y)}`).join(' ') + ' Z';

/**
 * Click spec shared by the polygon and the star: the centre first, then a
 * vertex. Shift snaps the direction to 15-degree steps.
 */
export function radialClicks<T extends PolygonItem | StarItem>(
  label: string,
  make: (center: Pt, r: number, rot: number, params: ShapeParams, style: Style, id: string) => T,
): ClickSpec {
  return {
    label,
    needed: 2,
    hint: () => 'Click a vertex (Shift snaps the angle to 15°)',
    build(pts, style, id, params) {
      if (pts.length < 2) return null;
      const [c, v] = pts;
      return make(c, Math.hypot(v.x - c.x, v.y - c.y), Math.atan2(v.y - c.y, v.x - c.x), params, style, id);
    },
    constrain(anchor, p) {
      const step = Math.PI / 12;
      const a = Math.round(Math.atan2(p.y - anchor.y, p.x - anchor.x) / step) * step;
      const d = Math.hypot(p.x - anchor.x, p.y - anchor.y);
      return { x: anchor.x + d * Math.cos(a), y: anchor.y + d * Math.sin(a) };
    },
  };
}

export const polygonType = defineShape<PolygonItem>({
  outline(it) {
    const v = polygonVertices(it.cx, it.cy, it.r, it.sides, it.rot);
    return [...v, v[0]];
  },
  trace(ctx, it) {
    polygonVertices(it.cx, it.cy, it.r, it.sides, it.rot).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  },
  pathData: (it) => closedPath(polygonVertices(it.cx, it.cy, it.r, it.sides, it.rot)),
  mapPoints(it, fn) {
    const c = fn({ x: it.cx, y: it.cy });
    return { ...it, cx: c.x, cy: c.y };
  },
  handles: (it) => [{ x: it.cx, y: it.cy }, polygonVertices(it.cx, it.cy, it.r, it.sides, it.rot)[0]],
  clicks: radialClicks<PolygonItem>('Polygon', (c, r, rot, params, style, id) => ({
    kind: 'polygon',
    id,
    cx: c.x,
    cy: c.y,
    r,
    sides: params.sides,
    rot,
    style,
  })),
});
