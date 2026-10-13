import { circle3, itemBounds } from './geometry';
import type { DocState, Item } from './types';

export function drawItem(ctx: CanvasRenderingContext2D, it: Item): void {
  if (it.kind === 'image') {
    ctx.drawImage(it.canvas, it.x, it.y);
    return;
  }
  ctx.save();
  ctx.strokeStyle = it.style.color;
  ctx.lineWidth = it.style.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(it.a.x, it.a.y);
  if (it.kind === 'line') {
    ctx.lineTo(it.b.x, it.b.y);
  } else if (it.kind === 'arc') {
    const c = circle3(it.a, it.b, it.m);
    if (c) ctx.arc(c.cx, c.cy, c.r, c.ta, c.tb, c.anticlockwise);
    else ctx.lineTo(it.b.x, it.b.y);
  } else {
    ctx.bezierCurveTo(it.c1.x, it.c1.y, it.c2.x, it.c2.y, it.b.x, it.b.y);
  }
  ctx.stroke();
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
  ctx.strokeStyle = '#4da3ff';
  for (const it of items) {
    const b = itemBounds(it);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#fff';
  const h = 3 / zoom;
  for (const it of items) {
    if (it.kind === 'image') continue;
    const pts = it.kind === 'line' ? [it.a, it.b] : it.kind === 'arc' ? [it.a, it.b, it.m] : [it.a, it.b, it.c1, it.c2];
    for (const p of pts) {
      ctx.fillRect(p.x - h, p.y - h, h * 2, h * 2);
      ctx.strokeRect(p.x - h, p.y - h, h * 2, h * 2);
    }
  }
  ctx.restore();
}
