import { itemBounds, transformItem, translateItem } from './geometry';
import { mapItems } from './model';
import type { Rect } from './math';
import { multiply, translation } from './matrix';
import type { DocState, Item } from './types';

export type AlignTo = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type Axis = 'x' | 'y';
export type Order = 'front' | 'back' | 'forward' | 'backward';

/** Items in `ids`, in stacking order (bottom layer first). */
export function itemsIn(s: DocState, ids: ReadonlySet<string>): Item[] {
  return s.layers.flatMap((l) => l.items.filter((it) => ids.has(it.id)));
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
