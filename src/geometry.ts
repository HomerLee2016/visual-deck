import { shapeTypeOf, typeOf } from './items/registry';
import { DEFAULT_SHAPE_PARAMS, type ClickSpec, type ShapeParams } from './items/types';
import type { Rect } from './math';
import { IDENTITY, apply, applyLinear, invert, multiply, scaleOf, transformRect, type Matrix } from './matrix';
import type { Item, Pt, ShapeItem, ShapeKind, Style } from './types';

export { circle3, dist, norm, type Circle, type Rect } from './math';

/** Polyline approximation of a shape (used for hit-testing and bounds). */
export function flatten(it: ShapeItem): Pt[] {
  return shapeTypeOf(it).outline(it);
}

/** Document-space box of the item (the local box, transformed). */
export function itemBounds(it: Item): Rect {
  const local = typeOf(it).bounds(it);
  return it.transform ? transformRect(local, it.transform) : local;
}

/** The axis-aligned rectangle spanned by two corner points. */
export function rectFromPoints(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

/** Whether a free-form loop (closed back to its first point) touches a rectangle. */
export function lassoTouchesRect(path: readonly Pt[], r: Rect): boolean {
  if (path.length < 2) return false;
  const corners = [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
  if (path.some((p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)) return true;
  if (corners.some((c) => pointInLoop(c, path))) return true;
  return path.some((a, i) => {
    const b = path[(i + 1) % path.length];
    return corners.some((c, j) => crosses(a, b, c, corners[(j + 1) % 4]));
  });
}

/** Ray-casting test against the closed loop `path`. */
function pointInLoop(p: Pt, path: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const a = path[i];
    const b = path[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether segment a-b properly crosses segment c-d. */
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const side = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** `tol` is in document units (callers pass a screen-pixel tolerance divided by zoom). */
export function hitTest(it: Item, p: Pt, tol: number): boolean {
  if (!it.transform) return typeOf(it).hitTest(it, p, tol);
  const inv = invert(it.transform);
  return !!inv && typeOf(it).hitTest(it, apply(inv, p), tol / scaleOf(it.transform));
}

/** Move the item by a document-space offset. Points move in local space, so rotated or scaled items still move exactly by (dx, dy). */
export function translateItem(it: Item, dx: number, dy: number): Item {
  const local = it.transform ? applyLinear(invert(it.transform) ?? IDENTITY, dx, dy) : { x: dx, y: dy };
  return typeOf(it).translate(it, local.x, local.y);
}

/** Apply `m` on top of the item's existing transform (in document space). */
export function transformItem(it: Item, m: Matrix): Item {
  return { ...it, transform: multiply(m, it.transform ?? IDENTITY) };
}

/** Shapes placed by clicking points. The brush is drawn by dragging, so it has no point count. */
export type ClickShapeKind = Exclude<ShapeKind, 'brush' | 'path'>;

/** Click-to-place parameters (point count and builder) for a shape tool. */
export function clickSpec(kind: ClickShapeKind): ClickSpec {
  const spec = shapeTypeOf(kind).clicks;
  if (!spec) throw new Error(`"${kind}" is not placed by clicks`);
  return spec;
}

/**
 * Build a shape from the points collected so far. Point order is always
 * start, end, then extras (arc: a point on the arc; curve: two control
 * points). With too few points it degrades to a straight preview line.
 */
export function buildShape(
  kind: ClickShapeKind,
  pts: Pt[],
  style: Style,
  id: string,
  params: ShapeParams = DEFAULT_SHAPE_PARAMS,
): ShapeItem | null {
  if (pts.length < 2) return null;
  return clickSpec(kind).build(pts, style, id, params);
}
