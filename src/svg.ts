import { svgOf } from './items/registry';
import type { SvgEnv } from './items/types';
import type { DocState, Item } from './types';

/**
 * Serialise a document as SVG. Shapes stay vector paths, image items are
 * embedded as PNG data. Hidden layers are skipped, as on screen.
 */
export function toSvg(s: DocState): string {
  const env: SvgEnv = { hrefs: new Map(), defs: new Map() };
  const body: string[] = [];
  for (const layer of s.layers) {
    if (!layer.visible) continue;
    for (const it of layer.items) body.push(itemToSvg(it, env));
  }
  const defs = [...env.defs.values()].map((d) => d.markup);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}">`,
    ...(defs.length ? [`<defs>${defs.join('')}</defs>`] : []),
    ...body,
    '</svg>',
    '',
  ].join('\n');
}

function itemToSvg(it: Item, env: SvgEnv): string {
  return svgOf(it, env);
}
