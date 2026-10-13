import type { ArcItem, CurveItem, Item, Pt, ShapeItem, ShapeKind, Style } from './types';

const TAU = Math.PI * 2;
export const norm = (a: number) => ((a % TAU) + TAU) % TAU;

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  cx: number;
  cy: number;
  r: number;
  /** Angle of the start point and the end point (radians). */
  ta: number;
  tb: number;
  /** Direction to travel from `ta` to `tb` so the arc passes through `m` (canvas semantics). */
  anticlockwise: boolean;
}

/** Circle through three points, with the arc direction a -> m -> b. Null if collinear. */
export function circle3(a: Pt, b: Pt, m: Pt): Circle | null {
  const d = 2 * (a.x * (b.y - m.y) + b.x * (m.y - a.y) + m.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const m2 = m.x * m.x + m.y * m.y;
  const cx = (a2 * (b.y - m.y) + b2 * (m.y - a.y) + m2 * (a.y - b.y)) / d;
  const cy = (a2 * (m.x - b.x) + b2 * (a.x - m.x) + m2 * (b.x - a.x)) / d;
  const ta = Math.atan2(a.y - cy, a.x - cx);
  const tb = Math.atan2(b.y - cy, b.x - cx);
  const tm = Math.atan2(m.y - cy, m.x - cx);
  const clockwise = norm(tm - ta) < norm(tb - ta);
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy), ta, tb, anticlockwise: !clockwise };
}

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

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
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
  }
}

/** Number of clicks/points each shape tool needs. */
export const POINTS_NEEDED: Record<ShapeKind, number> = { line: 2, arc: 3, curve: 4 };

/**
 * Build a shape from the points collected so far. Point order is always
 * start, end, then extras (arc: a point on the arc; curve: two control
 * points). With too few points it degrades to a straight preview line.
 */
export function buildShape(kind: ShapeKind, pts: Pt[], style: Style, id: string): ShapeItem | null {
  if (pts.length < 2) return null;
  const [a, b] = pts;
  if (kind === 'arc' && pts.length >= 3) return { kind: 'arc', id, a, b, m: pts[2], style };
  if (kind === 'curve' && pts.length >= 3) {
    return { kind: 'curve', id, a, b, c1: pts[2], c2: pts[3] ?? pts[2], style };
  }
  return { kind: 'line', id, a, b, style };
}
