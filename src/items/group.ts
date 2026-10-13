import { hitTest, itemBounds, translateItem } from '../geometry';
import type { Rect } from '../math';
import { typeOf, drawItem } from './registry';
import { transformAttr } from './shape';
import type { ItemType } from './types';
import type { GroupItem } from '../types';

/** Union of the children's boxes, in the group's own space. Empty groups have no size. */
function childBounds(it: GroupItem): Rect {
  if (it.items.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const boxes = it.items.map((c) => itemBounds(c));
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const groupType: ItemType<GroupItem> = {
  draw(ctx, it) {
    for (const c of it.items) drawItem(ctx, c);
  },
  bounds: childBounds,
  hitTest: (it, p, tol) => it.items.some((c) => hitTest(c, p, tol)),
  translate: (it, dx, dy) => ({ ...it, items: it.items.map((c) => translateItem(c, dx, dy)) }),
  toSvg: (it, hrefs) => `<g${transformAttr(it.transform)}>${it.items.map((c) => typeOf(c).toSvg(c, hrefs)).join('')}</g>`,
  handles: () => [],
};
