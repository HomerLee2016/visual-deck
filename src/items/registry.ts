import { arcType } from './arc';
import { brushType } from './brush';
import { curveType } from './curve';
import { lineType } from './line';
import type { ItemType, ShapeType } from './types';
import type { Item, ItemKind, ShapeItem, ShapeKind } from '../types';

/**
 * The behaviour of every item kind. Typed as a full map, so adding a kind to
 * `ItemKind` without registering it here is a compile error.
 * Image items are not registered yet (still handled in place).
 */
const types: Partial<{ [K in ItemKind]: ItemType<Extract<Item, { kind: K }>> }> = {
  line: lineType,
  arc: arcType,
  curve: curveType,
  brush: brushType,
};

/** Behaviour for an item's kind. Throws for an unregistered kind (a programming error). */
export function typeOf(it: Item): ItemType {
  return lookup(it.kind) as ItemType;
}

/** Behaviour for a vector shape, which additionally exposes its outline and path. */
export function shapeTypeOf(it: ShapeItem | ShapeKind): ShapeType {
  return lookup(typeof it === 'string' ? it : it.kind) as ShapeType;
}

function lookup(kind: ItemKind): ItemType {
  const t = types[kind];
  if (!t) throw new Error(`No item type registered for "${kind}"`);
  return t as ItemType;
}
