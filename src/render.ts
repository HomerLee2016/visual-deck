import { buildShape, itemBounds } from './geometry';
import { typeOf } from './items/registry';
import { apply } from './matrix';
import type { ClickShapeKind, Rect } from './geometry';
import type { DocState, Item, Pt, Style } from './types';
import type { Size, View } from './view';

const BACKDROP = '#26262b';
const DOC_BORDER = '#8a8a96';
const ACCENT = '#4da3ff';

export function drawItem(ctx: CanvasRenderingContext2D, it: Item): void {
  if (!it.transform) {
    typeOf(it).draw(ctx, it);
    return;
  }
  ctx.save();
  ctx.transform(...it.transform);
  typeOf(it).draw(ctx, it);
  ctx.restore();
}

/** Draw visible layers bottom to top. `only` renders a single layer regardless of its visibility. */
export function drawState(ctx: CanvasRenderingContext2D, s: DocState, only?: string): void {
  for (const layer of s.layers) {
    if (only ? layer.id !== only : !layer.visible) continue;
    for (const it of layer.items) drawItem(ctx, it);
  }
}

export function renderToCanvas(s: DocState, onlyLayerId?: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, s.width);
  c.height = Math.max(1, s.height);
  drawState(c.getContext('2d', { willReadFrequently: true })!, s, onlyLayerId);
  return c;
}

/** Small preview for the history list. */
export function thumbnail(s: DocState, max = 72): string | null {
  if (typeof document === 'undefined') return null;
  const scale = Math.min(1, max / Math.max(s.width, s.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(s.width * scale));
  c.height = Math.max(1, Math.round(s.height * scale));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#3a3a42';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(scale, scale);
  drawState(ctx, s);
  return c.toDataURL('image/png');
}

/** Selection outlines, in document space (line widths are divided by zoom to stay crisp). */
export function drawSelection(ctx: CanvasRenderingContext2D, items: Item[], zoom: number): void {
  ctx.save();
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([4 / zoom, 3 / zoom]);
  ctx.strokeStyle = ACCENT;
  for (const it of items) {
    const b = itemBounds(it);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#fff';
  const h = 3 / zoom;
  for (const it of items) {
    for (const local of typeOf(it).handles(it)) {
      const p = it.transform ? apply(it.transform, local) : local;
      ctx.fillRect(p.x - h, p.y - h, h * 2, h * 2);
      ctx.strokeRect(p.x - h, p.y - h, h * 2, h * 2);
    }
  }
  ctx.restore();
}

/** A shape being drawn: the points placed so far, plus the pointer standing in for the next one. */
export interface DraftPreview {
  kind: ClickShapeKind;
  pts: Pt[];
  hover: Pt;
}

/** Everything `drawScene` needs; the editor describes the frame and render.ts draws it. */
export interface Scene {
  state: DocState;
  view: View;
  /** Canvas size in CSS pixels. */
  size: Size;
  dpr: number;
  /** Selected items on visible layers. */
  selected: Item[];
  draft: DraftPreview | null;
  /** Points of the brush stroke being drawn, if any. */
  stroke: Pt[] | null;
  /** Style of the shape being drawn. */
  style: Style;
  /** Selection box in document space, while dragging one. */
  marquee: Rect | null;
}

const checkerPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

/** The transparency checkerboard shown behind the document. */
function checkerPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  let pattern = checkerPatterns.get(ctx);
  if (!pattern) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 16;
    const g = tile.getContext('2d')!;
    g.fillStyle = '#4a4a52';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#585862';
    g.fillRect(0, 0, 8, 8);
    g.fillRect(8, 8, 8, 8);
    pattern = ctx.createPattern(tile, 'repeat')!;
    checkerPatterns.set(ctx, pattern);
  }
  return pattern;
}

/** One frame of the editor canvas: backdrop, document, selection and in-progress interaction. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { state, view, size, dpr } = scene;
  const { zoom, panX, panY } = view;
  const { width, height } = state;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, size.w, size.h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(panX, panY, width * zoom, height * zoom);
  ctx.clip();
  ctx.fillStyle = checkerPattern(ctx);
  ctx.fillRect(panX, panY, width * zoom, height * zoom);
  ctx.restore();

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(zoom, zoom);
  ctx.imageSmoothingEnabled = zoom < 2;
  drawState(ctx, state);

  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = DOC_BORDER;
  ctx.strokeRect(0, 0, width, height);

  drawSelection(ctx, scene.selected, zoom);
  if (scene.draft) drawDraft(ctx, scene.draft, scene.style, zoom);
  if (scene.stroke) {
    ctx.globalAlpha = 0.8;
    drawItem(ctx, { kind: 'brush', id: 'preview', pts: scene.stroke, style: scene.style });
    ctx.globalAlpha = 1;
  }
  if (scene.marquee) drawMarquee(ctx, scene.marquee, zoom);
  ctx.restore();
}

function drawDraft(ctx: CanvasRenderingContext2D, draft: DraftPreview, style: Style, zoom: number): void {
  // The hovered position stands in for the next point to be placed.
  const shape = buildShape(draft.kind, [...draft.pts, draft.hover], style, 'preview');
  if (shape) {
    ctx.globalAlpha = 0.8;
    drawItem(ctx, shape);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = ACCENT;
  const r = 3.5 / zoom;
  for (const p of draft.pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMarquee(ctx: CanvasRenderingContext2D, r: Rect, zoom: number): void {
  ctx.fillStyle = 'rgba(77,163,255,0.12)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = ACCENT;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
}
