import { itemBounds, transformItem, translateItem } from './geometry';
import { mapItems } from './model';
import type { Rect } from './math';
import { multiply, translation } from './matrix';
import type { DocState, Item, ShapeItem } from './types';

export type AlignTo = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type Axis = 'x' | 'y';
export type Order = 'front' | 'back' | 'forward' | 'backward';

/** Items in `ids`, in stacking order (bottom layer first). */
export function itemsIn(s: DocState, ids: ReadonlySet<string>): Item[] {
  return s.layers.flatMap((l) => l.items.filter((it) => ids.has(it.id)));
}

/**
 * The selection as a document of its own: its items moved so their bounding
 * box starts at the origin, on the layers they were on, with that box as the size.
 */
export function cropToItems(s: DocState, ids: ReadonlySet<string>): DocState {
  const picked = itemsIn(s, ids);
  if (picked.length === 0) return s;
  const box = unionBox(picked.map(itemBounds));
  return {
    width: Math.max(1, Math.ceil(box.w)),
    height: Math.max(1, Math.ceil(box.h)),
    layers: s.layers.map((l) => ({
      ...l,
      items: l.items.filter((it) => ids.has(it.id)).map((it) => translateItem(it, -box.x, -box.y)),
    })),
    ...(s.defs ? { defs: s.defs } : {}),
    ...(s.symbols ? { symbols: s.symbols } : {}),
  };
}

/**
 * Change the document's size. Items move with the content they anchor to: an
 * anchor on the right keeps the right edge fixed, and so on.
 */
export function resizeDocument(s: DocState, width: number, height: number, anchorX: 0 | 1 | 2, anchorY: 0 | 1 | 2): DocState {
  const dx = [0, (width - s.width) / 2, width - s.width][anchorX];
  const dy = [0, (height - s.height) / 2, height - s.height][anchorY];
  return {
    ...s,
    width,
    height,
    layers: s.layers.map((l) => ({ ...l, items: l.items.map((it) => translateItem(it, dx, dy)) })),
  };
}

/** The smallest box that holds every rectangle. */
export function unionBox(boxes: Rect[]): Rect {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Move every selected item so it lines up with the selection's box on one side or centre. */
export function alignItems(s: DocState, ids: ReadonlySet<string>, to: AlignTo): DocState {
  const items = itemsIn(s, ids);
  if (items.length < 2) return s;
  const box = unionBox(items.map(itemBounds));
  const moves = new Map<string, { dx: number; dy: number }>();
  for (const it of items) {
    const b = itemBounds(it);
    const dx =
      to === 'left' ? box.x - b.x : to === 'right' ? box.x + box.w - (b.x + b.w) : to === 'hcenter' ? box.x + box.w / 2 - (b.x + b.w / 2) : 0;
    const dy =
      to === 'top' ? box.y - b.y : to === 'bottom' ? box.y + box.h - (b.y + b.h) : to === 'vcenter' ? box.y + box.h / 2 - (b.y + b.h / 2) : 0;
    moves.set(it.id, { dx, dy });
  }
  return mapItems(s, ids, (it) => {
    const m = moves.get(it.id)!;
    return translateItem(it, m.dx, m.dy);
  });
}

/** Space the selection evenly along an axis, keeping the outermost two items where they are. */
export function distributeItems(s: DocState, ids: ReadonlySet<string>, axis: Axis): DocState {
  const items = itemsIn(s, ids);
  if (items.length < 3) return s;
  const centre = (it: Item) => {
    const b = itemBounds(it);
    return axis === 'x' ? b.x + b.w / 2 : b.y + b.h / 2;
  };
  const sorted = [...items].sort((a, b) => centre(a) - centre(b));
  const first = centre(sorted[0]);
  const step = (centre(sorted[sorted.length - 1]) - first) / (sorted.length - 1);
  const moves = new Map<string, number>();
  sorted.forEach((it, i) => moves.set(it.id, first + step * i - centre(it)));
  return mapItems(s, ids, (it) => {
    const d = moves.get(it.id) ?? 0;
    return axis === 'x' ? translateItem(it, d, 0) : translateItem(it, 0, d);
  });
}

/** Mirror the selection across its own centre. */
export function flipItems(s: DocState, ids: ReadonlySet<string>, axis: Axis): DocState {
  const items = itemsIn(s, ids);
  if (items.length === 0) return s;
  const box = unionBox(items.map(itemBounds));
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const flip: [number, number, number, number, number, number] = axis === 'x' ? [-1, 0, 0, 1, 0, 0] : [1, 0, 0, -1, 0, 0];
  const m = multiply(translation(cx, cy), multiply(flip, translation(-cx, -cy)));
  return mapItems(s, ids, (it) => transformItem(it, m));
}

/**
 * Change stacking order within each layer. Selected items keep their order
 * relative to each other; the others keep theirs too.
 */
export function reorderItems(s: DocState, ids: ReadonlySet<string>, order: Order): DocState {
  return {
    ...s,
    layers: s.layers.map((layer) => {
      const items = [...layer.items];
      if (!items.some((it) => ids.has(it.id))) return layer;
      if (order === 'front' || order === 'back') {
        const picked = items.filter((it) => ids.has(it.id));
        const rest = items.filter((it) => !ids.has(it.id));
        return { ...layer, items: order === 'front' ? [...rest, ...picked] : [...picked, ...rest] };
      }
      // One step at a time: a selected item swaps with the neighbour beyond it, unless that neighbour is selected too.
      const step = order === 'forward' ? 1 : -1;
      const start = step === 1 ? items.length - 1 : 0;
      const end = step === 1 ? -1 : items.length;
      for (let i = start; i !== end; i -= step) {
        const j = i + step;
        if (ids.has(items[i].id) && j >= 0 && j < items.length && !ids.has(items[j].id)) {
          [items[i], items[j]] = [items[j], items[i]];
        }
      }
      return { ...layer, items };
    }),
  };
}

/**
 * Put the selected items into one group. The group takes the place of the
 * topmost selected item (in that item's layer); the others leave their layers.
 * Returns `s` unchanged unless at least two items are selected.
 */
export function groupItems(s: DocState, ids: ReadonlySet<string>, groupId: string): DocState {
  const picked = itemsIn(s, ids);
  if (picked.length < 2) return s;
  const top = picked[picked.length - 1];
  const group: Item = { kind: 'group', id: groupId, items: picked };
  return {
    ...s,
    layers: s.layers.map((layer) => {
      const rest = layer.items.filter((it) => !ids.has(it.id));
      const holdsTop = layer.items.some((it) => it.id === top.id);
      return { ...layer, items: holdsTop ? [...rest, group] : rest };
    }),
  };
}

/**
 * Replace the selected groups with their children. Each child takes over the
 * group's transform, so nothing moves on screen.
 */
export function ungroupItems(s: DocState, ids: ReadonlySet<string>): DocState {
  return {
    ...s,
    layers: s.layers.map((layer) => ({
      ...layer,
      items: layer.items.flatMap((it) => {
        if (it.kind !== 'group' || !ids.has(it.id)) return [it];
        return it.transform ? it.items.map((c) => transformItem(c, it.transform!)) : it.items;
      }),
    })),
  };
}

/** Kinds that can serve as a clipping or masking shape (they have an outline). */
const CLIP_KINDS: ReadonlySet<Item['kind']> = new Set(['line', 'arc', 'curve', 'brush', 'rect', 'ellipse', 'polygon', 'star', 'path']);

/**
 * Use the topmost selected shape to clip (or mask) the other selected items.
 * The shape leaves its layer and lives on each item as its clip. Returns `s`
 * unchanged unless there are two items and the top one is a shape.
 */
export function clipItems(s: DocState, ids: ReadonlySet<string>, mode: 'clip' | 'mask'): DocState {
  const picked = itemsIn(s, ids);
  if (picked.length < 2) return s;
  const top = picked[picked.length - 1];
  if (!CLIP_KINDS.has(top.kind)) return s;
  const shape = top as ShapeItem;
  const targets = new Set(picked.slice(0, -1).map((it) => it.id));
  return {
    ...s,
    layers: s.layers.map((layer) => ({
      ...layer,
      items: layer.items
        .filter((it) => it.id !== top.id)
        .map((it) => (targets.has(it.id) ? { ...it, clip: { mode, shape } } : it)),
    })),
  };
}

/** Take the clipping shape off the selected items and put it back in its layer, just above each. */
export function releaseClip(s: DocState, ids: ReadonlySet<string>): DocState {
  return {
    ...s,
    layers: s.layers.map((layer) => {
      const items: Item[] = [];
      for (const it of layer.items) {
        if (ids.has(it.id) && it.clip) {
          // The clipping shape goes back just above the item it was attached to.
          const { clip, ...without } = it;
          items.push(without as Item, clip.shape);
        } else {
          items.push(it);
        }
      }
      return { ...layer, items };
    }),
  };
}
