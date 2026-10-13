import type { Pt, PatternKind, MarkerKind, Style } from '../types';
import { esc, num } from './format';

/** The first and last real points of an outline, with the direction travelling out of each end. */
function ends(outline: Pt[]): { start: Pt; startDir: Pt; end: Pt; endDir: Pt } | null {
  const pts = outline.filter((p) => !Number.isNaN(p.x));
  if (pts.length < 2) return null;
  const a = pts[0];
  const b = pts[pts.length - 1];
  // A closed outline has no ends.
  if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-9) return null;
  const unit = (p: Pt, q: Pt) => {
    const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: (q.x - p.x) / l, y: (q.y - p.y) / l };
  };
  return { start: a, startDir: unit(pts[1], pts[0]), end: b, endDir: unit(pts[pts.length - 2], b) };
}

/** Draw a marker at `p`, pointing along `dir`, in the stroke colour. */
function drawMarker(ctx: CanvasRenderingContext2D, kind: MarkerKind, p: Pt, dir: Pt, style: Style): void {
  const size = Math.max(6, style.width * 3);
  ctx.fillStyle = style.color;
  ctx.beginPath();
  if (kind === 'dot') {
    ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
  } else {
    const back = { x: p.x - dir.x * size, y: p.y - dir.y * size };
    const side = { x: -dir.y * size * 0.5, y: dir.x * size * 0.5 };
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(back.x + side.x, back.y + side.y);
    ctx.lineTo(back.x - side.x, back.y - side.y);
    ctx.closePath();
  }
  ctx.fill();
}

/** Markers on an open outline's ends, if the style asks for them. */
export function drawMarkers(ctx: CanvasRenderingContext2D, outline: Pt[], style: Style): void {
  if (!style.markerStart && !style.markerEnd) return;
  const e = ends(outline);
  if (!e) return;
  if (style.markerStart) drawMarker(ctx, style.markerStart, e.start, { x: -e.startDir.x, y: -e.startDir.y }, style);
  if (style.markerEnd) drawMarker(ctx, style.markerEnd, e.end, e.endDir, style);
}

/** Canvas pattern tiles: diagonal stripes or dots in `color`, on a transparent background. */
const tiles = new Map<string, HTMLCanvasElement>();
export function patternTile(kind: PatternKind, color: string): HTMLCanvasElement {
  const key = `${kind}:${color}`;
  let t = tiles.get(key);
  if (!t) {
    t = document.createElement('canvas');
    t.width = t.height = 8;
    const g = t.getContext('2d')!;
    g.fillStyle = color;
    g.strokeStyle = color;
    if (kind === 'dots') {
      g.beginPath();
      g.arc(4, 4, 2, 0, Math.PI * 2);
      g.fill();
    } else {
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-2, 2);
      g.lineTo(2, -2);
      g.moveTo(6, 10);
      g.lineTo(10, 6);
      g.moveTo(-2, 10);
      g.lineTo(10, -2);
      g.stroke();
    }
    tiles.set(key, t);
  }
  return t;
}

/** SVG marker markup for a kind and colour (the definition only; the reference is added by the caller). */
export function markerMarkup(id: string, kind: MarkerKind, color: string): string {
  const shape = kind === 'dot' ? `<circle cx="5" cy="5" r="5" fill="${esc(color)}"/>` : `<path d="M0 0 L10 5 L0 10 z" fill="${esc(color)}"/>`;
  return `<marker id="${id}" viewBox="0 0 10 10" refX="${kind === 'dot' ? 5 : 10}" refY="5" markerWidth="${num(1)}" markerHeight="${num(1)}" markerUnits="strokeWidth" orient="auto-start-reverse" overflow="visible">${shape}</marker>`;
}

/** SVG pattern markup in the stroke colour. */
export function patternMarkup(id: string, kind: PatternKind, color: string): string {
  const body =
    kind === 'dots'
      ? `<circle cx="4" cy="4" r="2" fill="${esc(color)}"/>`
      : `<path d="M-2 2 L2 -2 M6 10 L10 6 M-2 10 L10 -2" stroke="${esc(color)}" stroke-width="2" fill="none"/>`;
  return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse">${body}</pattern>`;
}
