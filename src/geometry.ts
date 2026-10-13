import { shapeTypeOf, typeOf } from './items/registry';
import type { ClickSpec } from './items/types';
import type { Rect } from './math';
import type { ImageItem, Item, Pt, ShapeItem, ShapeKind, Style } from './types';

export { circle3, dist, norm, type Circle, type Rect } from './math';

/** Polyline approximation of a shape (used for hit-testing and bounds). */
export function flatten(it: ShapeItem): Pt[] {
  return shapeTypeOf(it).outline(it);
}

export function itemBounds(it: Item): Rect {
  if (it.kind === 'image') return { x: it.x, y: it.y, w: it.canvas.width, h: it.canvas.height };
  return typeOf(it).bounds(it);
}

/** The axis-aligned rectangle spanned by two corner points. */
export function rectFromPoints(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

function imageAlphaAt(it: ImageItem, p: Pt): boolean {
  const px = Math.floor(p.x - it.x);
  const py = Math.floor(p.y - it.y);
  if (px < 0 || py < 0 || px >= it.canvas.width || py >= it.canvas.height) return false;
  try {
    const ctx = it.canvas.getContext('2d', { willReadFrequently: true });
    return !ctx || ctx.getImageData(px, py, 1, 1).data[3] > 0;
  } catch {
    return true;
  }
}

/** `tol` is in document units (callers pass a screen-pixel tolerance divided by zoom). */
export function hitTest(it: Item, p: Pt, tol: number): boolean {
  if (it.kind === 'image') return imageAlphaAt(it, p);
  return typeOf(it).hitTest(it, p, tol);
}

export function translateItem(it: Item, dx: number, dy: number): Item {
  if (it.kind === 'image') return { ...it, x: it.x + dx, y: it.y + dy };
  return typeOf(it).translate(it, dx, dy);
}

/** Shapes placed by clicking points. The brush is drawn by dragging, so it has no point count. */
export type ClickShapeKind = Exclude<ShapeKind, 'brush'>;

/** Points each click-placed shape needs before it is complete. */
export const POINTS_NEEDED = {
  line: clickSpec('line').needed,
  arc: clickSpec('arc').needed,
  curve: clickSpec('curve').needed,
} satisfies Record<ClickShapeKind, number>;

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
export function buildShape(kind: ClickShapeKind, pts: Pt[], style: Style, id: string): ShapeItem | null {
  if (pts.length < 2) return null;
  return clickSpec(kind).build(pts, style, id);
}
