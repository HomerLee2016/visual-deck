import { buildShape, itemBounds, type ClickShapeKind, type Rect } from './geometry';
import { drawItem, typeOf } from './items/registry';
import { resolveDefs, resolveSymbols } from './shared';
import { apply } from './matrix';
import type { ShapeParams } from './items/types';
import type { Handle } from './handles';
import type { ViewAids } from './model';
import type { DocState, Item, PathItem, PathNode, Pt, Style } from './types';
import type { Size, View } from './view';
import type { Guides } from './snap';

const BACKDROP = '#26262b';
const DOC_BORDER = '#8a8a96';
const ACCENT = '#4da3ff';

/** Draw visible layers bottom to top. `only` renders a single layer regardless of its visibility. */
export function drawState(ctx: CanvasRenderingContext2D, s: DocState, only?: string): void {
  s = resolveDefs(resolveSymbols(s));
  for (const layer of s.layers) {
    if (only ? layer.id !== only : !layer.visible) continue;
    for (const it of layer.items) drawItem(ctx, it);
  }
}

/** The document as a bitmap, `scale` times its size (1, 2 or 4 for exports). */
export function renderToCanvas(s: DocState, onlyLayerId?: string, scale = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(s.width * scale));
  c.height = Math.max(1, Math.round(s.height * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(scale, scale);
  drawState(ctx, s, onlyLayerId);
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
export function drawSelection(
  ctx: CanvasRenderingContext2D,
  items: Item[],
  zoom: number,
  points: ReadonlyMap<string, ReadonlySet<number>>,
): void {
  ctx.save();
  ctx.lineWidth = 1 / zoom;
  ctx.setLineDash([4 / zoom, 3 / zoom]);
  ctx.strokeStyle = ACCENT;
  for (const it of items) {
    const b = itemBounds(it);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  ctx.setLineDash([]);
  const h = 3 / zoom;
  for (const it of items) {
    if (it.kind === 'image') continue;
    if (it.kind === 'brush') {
      // A brush stroke gets a handle on every point; selected points are filled.
      const picked = points.get(it.id);
      it.pts.forEach((p, i) => drawHandle(ctx, p, h, !!picked?.has(i)));
      continue;
    }
    for (const local of typeOf(it).handles(it)) {
      drawHandle(ctx, it.transform ? apply(it.transform, local) : local, h, false);
    }
    for (const p of typeOf(it).handles(it)) drawHandle(ctx, p, h, false);
  }
  ctx.restore();
}

function drawHandle(ctx: CanvasRenderingContext2D, p: Pt, h: number, selected: boolean): void {
  ctx.fillStyle = selected ? ACCENT : '#fff';
  ctx.fillRect(p.x - h, p.y - h, h * 2, h * 2);
  ctx.strokeRect(p.x - h, p.y - h, h * 2, h * 2);
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
  /** Selected points of brush strokes, by item id. */
  selectedPoints: ReadonlyMap<string, ReadonlySet<number>>;
  draft: DraftPreview | null;
  /** Points of the brush stroke being drawn, if any. */
  stroke: Pt[] | null;
  /** Style of the shape being drawn. */
  style: Style;
  /** Creation-time settings for the shape being drawn. */
  params: ShapeParams;
  /** Selection box in document space, while dragging one. */
  marquee: Rect | null;
  /** Brush size preview: the stroke width as a circle around the pointer, in document space. */
  brushCursor: { at: Pt; width: number } | null;
  /** Scale and rotate handles around the selection, or null when nothing is selected. */
  handles: Handle[] | null;
  aids: ViewAids;
  /** The path being edited in the node tool, with its selected node keys. */
  nodeEdit: { item: PathItem; sel: Set<string> } | null;
  /** Gradient handle pairs of the selection, in document space. */
  gradientLines: { a: Pt; b: Pt }[];
  /** A path being drawn with the pen: its nodes, and the pointer after the last one. */
  penDraft: { nodes: PathNode[]; hover: Pt } | null;
  /** A guide being dragged out of a ruler. */
  guideDraft: { axis: 'x' | 'y'; pos: number } | null;
}

/** Ruler strip width in screen pixels. */
export const RULER_PX = 16;
const GUIDE = '#ff5fa2';

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

  if (scene.aids.showGrid) drawGrid(ctx, scene.aids.gridSize, width, height, zoom);
  drawGuides(ctx, scene.aids.guides, scene.guideDraft, width, height, zoom);
  drawSelection(ctx, scene.selected, zoom, scene.selectedPoints);
  if (scene.draft) drawDraft(ctx, scene.draft, scene.style, scene.params, zoom);
  if (scene.stroke) {
    ctx.globalAlpha = 0.8;
    drawItem(ctx, { kind: 'brush', id: 'preview', pts: scene.stroke, style: scene.style });
    ctx.globalAlpha = 1;
  }
  if (scene.marquee) drawMarquee(ctx, scene.marquee, zoom);
  if (scene.brushCursor) drawBrushCursor(ctx, scene.brushCursor, zoom);
  if (scene.handles) drawHandles(ctx, scene.handles, zoom);
  if (scene.penDraft) drawPenDraft(ctx, scene.penDraft, scene.style, zoom);
  if (scene.nodeEdit) drawNodeEdit(ctx, scene.nodeEdit.item, scene.nodeEdit.sel, zoom);
  drawGradientLines(ctx, scene.gradientLines, zoom);
  ctx.restore();
  drawRulers(ctx, scene.view, scene.size);
}

/** The smallest 1-2-5 step (in document units) whose ticks are at least 50 screen pixels apart. */
export function rulerStep(zoom: number): number {
  for (let mag = 1; mag <= 1e6; mag *= 10) {
    for (const s of [1, 2, 5]) if (s * mag * zoom >= 50) return s * mag;
  }
  return 1e6;
}

/** Grid lines across the document, in document units. */
function drawGrid(ctx: CanvasRenderingContext2D, size: number, width: number, height: number, zoom: number): void {
  if (size * zoom < 4) return; // too dense to be useful
  ctx.save();
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  for (let x = size; x < width; x += size) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = size; y < height; y += size) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Guides run across the whole canvas; `draft` is the guide being dragged out of a ruler. */
function drawGuides(
  ctx: CanvasRenderingContext2D,
  guides: Guides,
  draft: { axis: 'x' | 'y'; pos: number } | null,
  width: number,
  height: number,
  zoom: number,
): void {
  const far = Math.max(width, height) * 4;
  ctx.save();
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = GUIDE;
  ctx.beginPath();
  const lines = [...guides.x.map((pos) => ({ axis: 'x' as const, pos })), ...guides.y.map((pos) => ({ axis: 'y' as const, pos }))];
  if (draft) lines.push(draft);
  for (const { axis, pos } of lines) {
    if (axis === 'x') {
      ctx.moveTo(pos, -far);
      ctx.lineTo(pos, far);
    } else {
      ctx.moveTo(-far, pos);
      ctx.lineTo(far, pos);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Rulers along the top and left of the canvas, in screen space, with ticks every readable step. */
function drawRulers(ctx: CanvasRenderingContext2D, view: View, size: Size): void {
  const { zoom, panX, panY } = view;
  const step = rulerStep(zoom);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(30,30,36,0.92)';
  ctx.fillRect(0, 0, size.w, RULER_PX);
  ctx.fillRect(0, 0, RULER_PX, size.h);
  ctx.strokeStyle = '#8a8a96';
  ctx.fillStyle = '#c9c9d1';
  ctx.font = '9px sans-serif';
  ctx.textBaseline = 'top';
  ctx.beginPath();
  const x0 = Math.ceil((RULER_PX - panX) / zoom / step) * step;
  for (let v = x0; panX + v * zoom < size.w; v += step) {
    const sx = Math.round(panX + v * zoom) + 0.5;
    ctx.moveTo(sx, RULER_PX - 6);
    ctx.lineTo(sx, RULER_PX);
    ctx.fillText(String(Math.round(v)), sx + 2, 2);
  }
  const y0 = Math.ceil((RULER_PX - panY) / zoom / step) * step;
  for (let v = y0; panY + v * zoom < size.h; v += step) {
    const sy = Math.round(panY + v * zoom) + 0.5;
    ctx.moveTo(RULER_PX - 6, sy);
    ctx.lineTo(RULER_PX, sy);
    ctx.save();
    ctx.translate(2, sy + 2);
    ctx.fillText(String(Math.round(v)), 0, 0);
    ctx.restore();
  }
  ctx.stroke();
  ctx.restore();
}

/** Gradient handles: a line joining the two handles, with a dot on each. */
function drawGradientLines(ctx: CanvasRenderingContext2D, lines: { a: Pt; b: Pt }[], zoom: number): void {
  const r = 4 / zoom;
  ctx.save();
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = GUIDE;
  ctx.fillStyle = '#fff';
  for (const { a, b } of lines) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    for (const p of [a, b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Nodes as squares (filled when selected) with their handles as stalks and dots. */
function drawNodeEdit(ctx: CanvasRenderingContext2D, it: PathItem, sel: Set<string>, zoom: number): void {
  const h = 3.5 / zoom;
  ctx.save();
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = ACCENT;
  it.subs.forEach((sub, s) => {
    sub.nodes.forEach((n, i) => {
      for (const hp of [n.in, n.out]) {
        if (!hp) continue;
        ctx.beginPath();
        ctx.moveTo(n.p.x, n.p.y);
        ctx.lineTo(hp.x, hp.y);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, h * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      const on = sel.has(`${s}.${i}`);
      ctx.fillStyle = on ? ACCENT : '#fff';
      ctx.fillRect(n.p.x - h, n.p.y - h, h * 2, h * 2);
      ctx.strokeRect(n.p.x - h, n.p.y - h, h * 2, h * 2);
    });
  });
  ctx.restore();
}

/** The pen path in progress: the placed nodes, the segment to the pointer, and a dot on each node. */
function drawPenDraft(ctx: CanvasRenderingContext2D, d: { nodes: PathNode[]; hover: Pt }, style: Style, zoom: number): void {
  const preview = { kind: 'path' as const, id: 'preview', subs: [{ nodes: [...d.nodes, { p: d.hover }], closed: false }], style };
  ctx.globalAlpha = 0.8;
  drawItem(ctx, preview);
  ctx.globalAlpha = 1;
  ctx.fillStyle = ACCENT;
  const r = 3.5 / zoom;
  for (const n of d.nodes) {
    ctx.beginPath();
    ctx.arc(n.p.x, n.p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Scale handles as small squares, the rotate handle as a knob on a stalk. */
function drawHandles(ctx: CanvasRenderingContext2D, handles: Handle[], zoom: number): void {
  const h = 3.5 / zoom;
  const top = handles.find((x) => x.id === 'n')!;
  const rot = handles.find((x) => x.id === 'rot')!;
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = ACCENT;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(rot.x, rot.y);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const p of handles) {
    if (p.id === 'rot') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, h * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(p.x - h, p.y - h, h * 2, h * 2);
      ctx.strokeRect(p.x - h, p.y - h, h * 2, h * 2);
    }
  }
}

/** Brush outline: a dark ring under a white one, so it shows on both light and dark content. */
function drawBrushCursor(ctx: CanvasRenderingContext2D, c: { at: Pt; width: number }, zoom: number): void {
  ctx.beginPath();
  ctx.arc(c.at.x, c.at.y, c.width / 2, 0, Math.PI * 2);
  ctx.lineWidth = 3 / zoom;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}

function drawDraft(ctx: CanvasRenderingContext2D, draft: DraftPreview, style: Style, params: ShapeParams, zoom: number): void {
  // The hovered position stands in for the next point to be placed.
  const shape = buildShape(draft.kind, [...draft.pts, draft.hover], style, 'preview', params);
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
