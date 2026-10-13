import { arcType } from './arc';
import { brushType } from './brush';
import { curveType } from './curve';
import { ellipseType } from './ellipse';
import { polygonType } from './polygon';
import { starType } from './star';
import { imageType } from './image';
import { lineType } from './line';
import { rectType } from './rect';
import type { ItemType, ShapeType } from './types';
import type { Item, ItemKind, ShapeItem, ShapeKind } from '../types';

/**
 * The behaviour of every item kind. Typed as a full map, so adding a kind to
 * `ItemKind` without registering it here is a compile error.
 */
const types: { [K in ItemKind]: ItemType<Extract<Item, { kind: K }>> } = {
  line: lineType,
  arc: arcType,
  curve: curveType,
  brush: brushType,
  image: imageType,
  rect: rectType,
  ellipse: ellipseType,
  polygon: polygonType,
  star: starType,
};

/** Behaviour for an item's kind. */
export function typeOf(it: Item): ItemType {
  return lookup(it.kind) as ItemType;
}

/** Behaviour for a vector shape, which additionally exposes its outline and path. */
export function shapeTypeOf(it: ShapeItem | ShapeKind): ShapeType {
  return lookup(typeof it === 'string' ? it : it.kind) as ShapeType;
}

function lookup(kind: ItemKind): ItemType {
  return types[kind] as ItemType;
}
