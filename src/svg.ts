import { typeOf } from './items/registry';
import type { DocState, Item } from './types';

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
  return typeOf(it).toSvg(it, hrefs);
}
