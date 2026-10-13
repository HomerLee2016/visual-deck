import { polygonVertices } from './items/polygon';
import { circle3, norm } from './math';
import type { Item, PathItem, PathNode, Pt, Style } from './types';

/** Cubic control-point factor for a quarter circle (about 0.5523). */
const KAPPA = 0.5522847498;

const pathOf = (id: string, style: Style, nodes: PathNode[], closed: boolean, transform?: PathItem['transform']): PathItem => ({
  kind: 'path',
  id,
  subs: [{ nodes, closed }],
  style,
  ...(transform ? { transform } : {}),
});

/**
 * Cubic nodes for a circular arc from `a` to `b` through `m`: one node per
 * quarter turn at most, with handles that match the circle's tangents.
 */
function arcNodes(a: Pt, b: Pt, m: Pt): PathNode[] | null {
  const c = circle3(a, b, m);
  if (!c) return null;
  const sweep = c.anticlockwise ? -norm(c.ta - c.tb) : norm(c.tb - c.ta);
  const pieces = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
  const step = sweep / pieces;
  const at = (t: number): Pt => ({ x: c.cx + c.r * Math.cos(t), y: c.cy + c.r * Math.sin(t) });
  const tangent = (t: number, sign: 1 | -1): Pt => ({ x: -Math.sin(t) * sign, y: Math.cos(t) * sign });
  const k = (4 / 3) * Math.tan(step / 4) * c.r;
  const nodes: PathNode[] = [];
  for (let i = 0; i <= pieces; i++) {
    const t = c.ta + step * i;
    const p = at(t);
    const node: PathNode = { p };
    if (i > 0) {
      const prevT = c.ta + step * (i - 1);
      const dir = tangent(t, 1);
      node.in = { x: p.x - dir.x * k, y: p.y - dir.y * k };
      nodes[i - 1].out = { x: at(prevT).x + tangent(prevT, 1).x * k, y: at(prevT).y + tangent(prevT, 1).y * k };
    }
    nodes.push(node);
  }
  return nodes;
}

/**
 * Nodes for an axis-aligned rectangle with corner radius `r0`. Straight edges
 * join corner nodes; each rounded corner is one cubic between two tangent points.
 */
function rectNodes(x: number, y: number, w: number, h: number, r0: number): PathNode[] {
  const r = Math.max(0, Math.min(r0, w / 2, h / 2));
  if (r === 0) return corners([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]);
  const k = r * KAPPA;
  return [
    { p: { x: x + r, y }, in: { x: x + r - k, y } }, // top edge, start
    { p: { x: x + w - r, y }, out: { x: x + w - r + k, y } }, // top-right corner, start
    { p: { x: x + w, y: y + r }, in: { x: x + w, y: y + r - k } }, // right edge, start
    { p: { x: x + w, y: y + h - r }, out: { x: x + w, y: y + h - r + k } }, // bottom-right corner, start
    { p: { x: x + w - r, y: y + h }, in: { x: x + w - r + k, y: y + h } }, // bottom edge, start
    { p: { x: x + r, y: y + h }, out: { x: x + r - k, y: y + h } }, // bottom-left corner, start
    { p: { x, y: y + h - r }, in: { x, y: y + h - r + k } }, // left edge, start
    { p: { x, y: y + r }, out: { x, y: y + r - k } }, // top-left corner, start
  ];
}

/** Four cubic quarters of an ellipse, starting at the rightmost point. */
function ellipseNodes(cx: number, cy: number, rx: number, ry: number): PathNode[] {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    { p: { x: cx + rx, y: cy }, in: { x: cx + rx, y: cy + ky }, out: { x: cx + rx, y: cy - ky } },
    { p: { x: cx, y: cy - ry }, in: { x: cx + kx, y: cy - ry }, out: { x: cx - kx, y: cy - ry } },
    { p: { x: cx - rx, y: cy }, in: { x: cx - rx, y: cy - ky }, out: { x: cx - rx, y: cy + ky } },
    { p: { x: cx, y: cy + ry }, in: { x: cx - kx, y: cy + ry }, out: { x: cx + kx, y: cy + ry } },
  ];
}

const corners = (pts: Pt[]): PathNode[] => pts.map((p) => ({ p }));

/**
 * The item as a path, or null for kinds that cannot become one (text, images,
 * groups). Curves keep their handles; circles, rectangles and arcs become cubic
 * nodes. Transforms carry over unchanged.
 */
export function toPath(it: Item, id: string): PathItem | null {
  switch (it.kind) {
    case 'line':
      return pathOf(id, it.style, corners([it.a, it.b]), false, it.transform);
    case 'curve':
      return pathOf(id, it.style, [{ p: it.a, out: it.c1 }, { p: it.b, in: it.c2 }], false, it.transform);
    case 'arc':
      return pathOf(id, it.style, arcNodes(it.a, it.b, it.m) ?? corners([it.a, it.b]), false, it.transform);
    case 'brush':
      return pathOf(id, it.style, corners(it.pts), false, it.transform);
    case 'rect':
      return pathOf(id, it.style, rectNodes(it.x, it.y, it.w, it.h, it.r), true, it.transform);
    case 'ellipse':
      return pathOf(id, it.style, ellipseNodes(it.cx, it.cy, it.rx, it.ry), true, it.transform);
    case 'polygon':
      return pathOf(id, it.style, corners(polygonVertices(it.cx, it.cy, it.r, it.sides, it.rot)), true, it.transform);
    case 'star':
      return pathOf(id, it.style, corners(polygonVertices(it.cx, it.cy, it.r, it.sides, it.rot, it.inner)), true, it.transform);
    case 'path':
      return it;
    default:
      return null;
  }
}

/** Walk a path the other way: each subpath's nodes reversed, with their handles swapped. */
export function reversePath(it: PathItem): PathItem {
  return {
    ...it,
    subs: it.subs.map((sub) => ({
      ...sub,
      nodes: [...sub.nodes].reverse().map((n) => ({ p: n.p, ...(n.out ? { in: n.out } : {}), ...(n.in ? { out: n.in } : {}) })),
    })),
  };
}

/** Ramer-Douglas-Peucker: keep the points that stray more than `eps` from the simplified line. */
export function simplifyPoints(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const first = pts[0];
  const last = pts[pts.length - 1];
  let worst = 0;
  let index = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distanceToLine(pts[i], first, last);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }
  if (worst <= eps) return [first, last];
  const left = simplifyPoints(pts.slice(0, index + 1), eps);
  const right = simplifyPoints(pts.slice(index), eps);
  return [...left.slice(0, -1), ...right];
}

function distanceToLine(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/** A freehand stroke as a path with fewer corner nodes, within `eps` document units of the original. */
export function simplifyBrush(pts: Pt[], style: Style, id: string, eps: number, transform?: PathItem['transform']): PathItem {
  return pathOf(id, style, corners(simplifyPoints(pts, eps)), false, transform);
}
