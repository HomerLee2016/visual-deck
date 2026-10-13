import type { StarItem } from '../types';
import { closedPath, polygonVertices, radialClicks } from './polygon';
import { defineShape } from './shape';

const verts = (it: StarItem) => polygonVertices(it.cx, it.cy, it.r, it.sides, it.rot, it.inner);

export const starType = defineShape<StarItem>({
  outline: (it) => [...verts(it), verts(it)[0]],
  trace(ctx, it) {
    verts(it).forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  },
  pathData: (it) => closedPath(verts(it)),
  mapPoints(it, fn) {
    const c = fn({ x: it.cx, y: it.cy });
    return { ...it, cx: c.x, cy: c.y };
  },
  handles: (it) => [{ x: it.cx, y: it.cy }, verts(it)[0]],
  clicks: radialClicks<StarItem>('Star', (c, r, rot, params, style, id) => ({
    kind: 'star',
    id,
    cx: c.x,
    cy: c.y,
    r,
    sides: params.sides,
    inner: params.inner,
    rot,
    style,
  })),
});
