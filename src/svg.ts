import { circle3, norm } from './geometry';
import type { DocState, Item, ShapeItem } from './types';

const num = (v: number) => String(Math.round(v * 1000) / 1000);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Serialise a document as SVG. Shapes stay vector paths, image items are
 * embedded as PNG data. Hidden layers are skipped, as on screen.
 */
export function toSvg(s: DocState): string {
  const hrefs = new Map<HTMLCanvasElement, string>();
  const body: string[] = [];
  for (const layer of s.layers) {
    if (!layer.visible) continue;
    for (const it of layer.items) body.push(itemToSvg(it, hrefs));
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}">`,
    ...body,
    '</svg>',
    '',
  ].join('\n');
}

function itemToSvg(it: Item, hrefs: Map<HTMLCanvasElement, string>): string {
  if (it.kind === 'image') {
    let href = hrefs.get(it.canvas);
    if (!href) {
      href = it.canvas.toDataURL('image/png');
      hrefs.set(it.canvas, href);
    }
    return `<image x="${num(it.x)}" y="${num(it.y)}" width="${it.canvas.width}" height="${it.canvas.height}" href="${href}"/>`;
  }
  const { color, width } = it.style;
  return `<path d="${pathData(it)}" fill="none" stroke="${esc(color)}" stroke-width="${num(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function pathData(it: ShapeItem): string {
  const start = `M${num(it.a.x)} ${num(it.a.y)}`;
  const end = `${num(it.b.x)} ${num(it.b.y)}`;
  if (it.kind === 'line') return `${start} L${end}`;
  if (it.kind === 'curve') {
    return `${start} C${num(it.c1.x)} ${num(it.c1.y)} ${num(it.c2.x)} ${num(it.c2.y)} ${end}`;
  }
  const c = circle3(it.a, it.b, it.m);
  if (!c) return `${start} L${end}`;
  // Same direction rules as the canvas arc in render.ts: sweep-flag 1 = increasing angle.
  const span = c.anticlockwise ? norm(c.ta - c.tb) : norm(c.tb - c.ta);
  const largeArc = span > Math.PI ? 1 : 0;
  const sweep = c.anticlockwise ? 0 : 1;
  return `${start} A${num(c.r)} ${num(c.r)} 0 ${largeArc} ${sweep} ${end}`;
}
