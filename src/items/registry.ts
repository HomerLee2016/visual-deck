import type { ItemType, ShapeType } from './types';
import type { Item, ItemKind, ShapeItem, ShapeKind } from '../types';

/** One entry per item kind, filled in by the per-kind modules. */
type Registry = { [K in ItemKind]: ItemType<Extract<Item, { kind: K }>> };

const types: Partial<Registry> = {};

/** Register the behaviour for `kind`. Each kind is registered exactly once. */
export function register<K extends ItemKind>(kind: K, type: ItemType<Extract<Item, { kind: K }>>): void {
  if (types[kind]) throw new Error(`Item kind "${kind}" is already registered`);
  // The map is keyed by kind, so each value matches its key; TS cannot see that across the generic.
  (types as Record<ItemKind, unknown>)[kind] = type;
}

/** Behaviour for an item's kind. Throws for an unregistered kind (a programming error). */
export function typeOf(it: Item): ItemType {
  return lookup(it.kind) as ItemType;
}

/** Behaviour for a vector shape, which additionally exposes its outline and path. */
export function shapeTypeOf(it: ShapeItem | ShapeKind): ShapeType {
  const kind = typeof it === 'string' ? it : it.kind;
  return lookup(kind) as ShapeType;
}

function lookup(kind: ItemKind): ItemType {
  const t = types[kind];
  if (!t) throw new Error(`No item type registered for "${kind}"`);
  return t as ItemType;
}
