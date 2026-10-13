import { circle3, distToSegment, norm, type Rect } from './math';
import type { ArcItem, CurveItem, Item, Pt, ShapeItem, ShapeKind, Style } from './types';

export { circle3, dist, norm, type Circle, type Rect } from './math';

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

function flattenCurve(it: CurveItem, n = 48): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const k0 = u * u * u;
    const k1 = 3 * u * u * t;
    const k2 = 3 * u * t * t;
    const k3 = t * t * t;
    pts.push({
      x: k0 * it.a.x + k1 * it.c1.x + k2 * it.c2.x + k3 * it.b.x,
      y: k0 * it.a.y + k1 * it.c1.y + k2 * it.c2.y + k3 * it.b.y,
    });
  }
  return pts;
}

/** Polyline approximation of a shape (used for hit-testing and bounds). */
export function flatten(it: ShapeItem): Pt[] {
  switch (it.kind) {
    case 'line':
      return [it.a, it.b];
    case 'arc':
      return flattenArc(it);
    case 'curve':
      return flattenCurve(it);
    case 'brush':
      return it.pts;
  }
}

export function itemBounds(it: Item): Rect {
  if (it.kind === 'image') return { x: it.x, y: it.y, w: it.canvas.width, h: it.canvas.height };
  const pts = flatten(it);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const pad = it.style.width / 2;
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

/** The axis-aligned rectangle spanned by two corner points. */
export function rectFromPoints(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

function imageAlphaAt(it: Extract<Item, { kind: 'image' }>, p: Pt): boolean {
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
  const pts = flatten(it);
  const reach = tol + it.style.width / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    if (distToSegment(p, pts[i], pts[i + 1]) <= reach) return true;
  }
  return false;
}

const mv = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy });

export function translateItem(it: Item, dx: number, dy: number): Item {
  switch (it.kind) {
    case 'image':
      return { ...it, x: it.x + dx, y: it.y + dy };
    case 'line':
      return { ...it, a: mv(it.a, dx, dy), b: mv(it.b, dx, dy) };
    case 'arc':
      return { ...it, a: mv(it.a, dx, dy), b: mv(it.b, dx, dy), m: mv(it.m, dx, dy) };
    case 'curve':
      return {
        ...it,
        a: mv(it.a, dx, dy),
        b: mv(it.b, dx, dy),
        c1: mv(it.c1, dx, dy),
        c2: mv(it.c2, dx, dy),
      };
    case 'brush':
      return { ...it, pts: it.pts.map((p) => mv(p, dx, dy)) };
  }
}

/** Shapes placed by clicking points. The brush is drawn by dragging, so it has no point count. */
export type ClickShapeKind = Exclude<ShapeKind, 'brush'>;

/** Number of clicks/points each shape tool needs. */
export const POINTS_NEEDED: Record<ClickShapeKind, number> = { line: 2, arc: 3, curve: 4 };

/**
 * Build a shape from the points collected so far. Point order is always
 * start, end, then extras (arc: a point on the arc; curve: two control
 * points). With too few points it degrades to a straight preview line.
 */
export function buildShape(kind: ClickShapeKind, pts: Pt[], style: Style, id: string): ShapeItem | null {
  if (pts.length < 2) return null;
  const [a, b] = pts;
  if (kind === 'arc' && pts.length >= 3) return { kind: 'arc', id, a, b, m: pts[2], style };
  if (kind === 'curve' && pts.length >= 3) {
    return { kind: 'curve', id, a, b, c1: pts[2], c2: pts[3] ?? pts[2], style };
  }
  return { kind: 'line', id, a, b, style };
}
