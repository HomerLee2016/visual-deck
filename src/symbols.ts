import { itemBounds, translateItem } from './geometry';
import { itemsIn, unionBox } from './arrange';
import type { DocState, GroupItem, Item } from './types';

/** A new symbol id that no existing symbol uses. */
export function newSymbolId(s: DocState): string {
  let n = Object.keys(s.symbols ?? {}).length + 1;
  while (s.symbols && `sym${n}` in s.symbols) n++;
  return `sym${n}`;
}

/**
 * Save the selection as a symbol and replace it with one instance of it. The
 * symbol's content is laid out from the origin; the instance is placed where
 * the selection was, so nothing moves on screen.
 */
export function makeSymbol(s: DocState, ids: ReadonlySet<string>, symbolId: string): DocState {
  const picked = itemsIn(s, ids);
  if (picked.length === 0) return s;
  const box = unionBox(picked.map(itemBounds));
  const content = picked.map((it) => translateItem(it, -box.x, -box.y));
  const instance: GroupItem = {
    kind: 'group',
    id: `${symbolId}-instance`,
    items: content,
    symbolId,
    transform: [1, 0, 0, 1, box.x, box.y],
  };
  const top = picked[picked.length - 1];
  return {
    ...s,
    symbols: { ...s.symbols, [symbolId]: content },
    layers: s.layers.map((layer) => {
      const rest = layer.items.filter((it) => !ids.has(it.id));
      const holdsTop = layer.items.some((it) => it.id === top.id);
      return { ...layer, items: holdsTop ? [...rest, instance] : rest };
    }),
  };
}

/** Place a new instance of a symbol at (x, y), on top of a layer. */
export function placeInstance(s: DocState, symbolId: string, x: number, y: number, layerId: string, instanceId: string): DocState {
  if (!s.symbols?.[symbolId]) return s;
  const instance: GroupItem = { kind: 'group', id: instanceId, items: s.symbols[symbolId], symbolId, transform: [1, 0, 0, 1, x, y] };
  return {
    ...s,
    layers: s.layers.map((l) => (l.id === layerId ? { ...l, items: [...l.items, instance as Item] } : l)),
  };
}
