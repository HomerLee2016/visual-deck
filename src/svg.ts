import { svgOf } from './items/registry';
import type { SvgEnv } from './items/types';
import { resolveDefs, resolveItem } from './shared';
import type { DocState, Item } from './types';

/**
 * Serialise a document as SVG. Shapes stay vector paths, image items are
 * embedded as PNG data. Hidden layers are skipped, as on screen.
 */
export function toSvg(doc: DocState): string {
  const s = resolveDefs(doc);
  // Symbols are written with their shared paint resolved, like the layers.
  const symbols = Object.fromEntries(Object.entries(s.symbols ?? {}).map(([id, items]) => [id, items.map((it) => resolveItem(it, s.defs ?? {}))]));
  const env: SvgEnv = { hrefs: new Map(), defs: new Map(), symbols };
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
