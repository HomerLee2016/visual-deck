import { flattenSub } from './items/path';
import { toPath } from './convert';
import type { Item, PathItem, PathNode, Pt, SubPath } from './types';

/** A polyline with whether it closes back on itself. */
export interface Poly {
  pts: Pt[];
  closed: boolean;
}

/** A closed polyline lists its first point once: flattening repeats it at the end, which would make a zero-length edge. */
function polyOf(pts: Pt[], closed: boolean): Poly {
  const last = pts[pts.length - 1];
  const dropLast = closed && pts.length > 1 && last.x === pts[0].x && last.y === pts[0].y;
  return { pts: dropLast ? pts.slice(0, -1) : pts, closed };
}

/** Polylines of any item's outline, via its path form. Null for items that cannot be outlined. */
export function polysOf(it: Item): Poly[] | null {
  const path = toPath(it, it.id);
  if (!path) return null;
  return path.subs.filter((s) => s.nodes.length > 1).map((s) => polyOf(flattenSub(s, 12), s.closed));
}

const unit = (a: Pt, b: Pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
};
/** Left-hand normal of the direction (dx, dy). */
const normalOf = (d: Pt): Pt => ({ x: -d.y, y: d.x });

/** Signed area (positive for counter-clockwise in y-down screen space is not assumed; only the sign matters). */
const signedArea = (pts: Pt[]) => {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

/**
 * Offset a polyline by `d`, joining neighbouring offset edges at a miter
 * point (capped at 4x). Open polylines offset to their left for positive `d`;
 * closed ones offset outwards for positive `d`, whichever way they wind.
 */
function offsetPoly(poly: Poly, d0: number): Pt[] {
  const { pts, closed } = poly;
  const n = pts.length;
  // In y-down screen space a counter-clockwise (positive area) ring has its interior on the left.
  const d = closed && signedArea(pts) > 0 ? -d0 : d0;
  const seg = (i: number) => unit(pts[i], pts[(i + 1) % n]);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const hasPrev = closed || i > 0;
    const hasNext = closed || i < n - 1;
    const nPrev = hasPrev ? normalOf(seg(closed ? (i - 1 + n) % n : i - 1)) : null;
    const nNext = hasNext ? normalOf(seg(i)) : null;
    let nx: Pt;
    let scale: number;
    if (nPrev && nNext) {
      const sum = { x: nPrev.x + nNext.x, y: nPrev.y + nNext.y };
      const len = Math.hypot(sum.x, sum.y);
      const cos = len > 1e-9 ? len / 2 : 0;
      nx = len > 1e-9 ? { x: sum.x / len, y: sum.y / len } : nNext;
      scale = cos > 0.25 ? 1 / cos : 4;
    } else {
      nx = (nNext ?? nPrev)!;
      scale = 1;
    }
    out.push({ x: pts[i].x + nx.x * d * scale, y: pts[i].y + nx.y * d * scale });
  }
  return out;
}

/** Grow (positive `d`) or shrink (negative) the outline. Closed outlines keep their shape; open ones offset on one side. */
export function offsetPath(it: PathItem, d: number): PathItem {
  const subs: SubPath[] = it.subs.map((s) => {
    const pts = offsetPoly(polyOf(flattenSub(s, 12), s.closed), d);
    return { closed: s.closed, nodes: pts.map((p): PathNode => ({ p })) };
  });
  return { ...it, subs };
}

/**
 * The stroke of each polyline as filled outlines (for `width` on both sides).
 * Caps are butt, round or square; joins are mitred. Closed polylines give an
 * outer and an inner ring with opposite direction, so the hole is kept under
 * the nonzero fill rule.
 */
export function strokeOutline(polys: Poly[], width: number, cap: 'butt' | 'round' | 'square' = 'round'): PathItem['subs'] {
  const h = width / 2;
  const subs: SubPath[] = [];
  for (const poly of polys) {
    if (poly.pts.length < 2) continue;
    if (poly.closed) {
      // Outer ring outwards, inner ring inwards and reversed: the opposite winding makes a hole under the nonzero rule.
      const outer = offsetPoly(poly, h);
      const inner = offsetPoly(poly, -h).reverse();
      subs.push({ closed: true, nodes: outer.map((p) => ({ p })) });
      subs.push({ closed: true, nodes: inner.map((p) => ({ p })) });
      continue;
    }
    const left = offsetPoly(poly, h);
    const right = offsetPoly(poly, -h).reverse();
    const start = poly.pts[0];
    const end = poly.pts[poly.pts.length - 1];
    const dStart = unit(poly.pts[1], start);
    const dEnd = unit(poly.pts[poly.pts.length - 2], end);
    const endCap = capPoints(end, dEnd, h, cap);
    const startCap = capPoints(start, dStart, h, cap);
    subs.push({ closed: true, nodes: [...left, ...endCap, ...right, ...startCap].map((p) => ({ p })) });
  }
  return subs;
}

/** Points that close a stroke's end on the far side of `end`, going from the left edge to the right edge. */
function capPoints(end: Pt, dir: Pt, h: number, cap: 'butt' | 'round' | 'square'): Pt[] {
  const n = normalOf(dir);
  if (cap === 'butt') return [];
  if (cap === 'square') {
    return [
      { x: end.x + n.x * h + dir.x * h, y: end.y + n.y * h + dir.y * h },
      { x: end.x - n.x * h + dir.x * h, y: end.y - n.y * h + dir.y * h },
    ];
  }
  const pts: Pt[] = [];
  const steps = 8;
  for (let i = 1; i < steps; i++) {
    const a = (Math.PI * i) / steps;
    // Sweep from +normal through the direction of travel to -normal.
    pts.push({
      x: end.x + h * (Math.cos(a) * n.x + Math.sin(a) * dir.x),
      y: end.y + h * (Math.cos(a) * n.y + Math.sin(a) * dir.y),
    });
  }
  return pts;
}

/**
 * The item's stroke as a filled path: the fill takes the stroke colour and the
 * outline keeps the transform. Null for items that cannot be outlined.
 */
export function outlineItem(it: Item): PathItem | null {
  const polys = polysOf(it);
  if (!polys) return null;
  const { style } = it as { style: PathItem['style'] };
  const subs = strokeOutline(polys, style.width, style.cap ?? 'round');
  // A dashed stroke is outlined solid; the filled outline has no stroke of its own.
  return { kind: 'path', id: it.id, subs, style: { ...style, fill: style.color, width: 0, dash: undefined }, ...(it.transform ? { transform: it.transform } : {}) };
}
