import { describe, expect, it } from 'vitest';
import { itemBounds } from './geometry';
import { alignItems, distributeItems, flipItems, reorderItems, unionBox } from './arrange';
import type { DocState, LineItem } from './types';

const style = { color: '#fff', width: 0 };
const seg = (id: string, x0: number, y0: number, x1: number, y1: number): LineItem => ({
  kind: 'line',
  id,
  a: { x: x0, y: y0 },
  b: { x: x1, y: y1 },
  style,
});
const doc = (...items: LineItem[]): DocState => ({ width: 100, height: 100, layers: [{ id: 'l', name: 'L', visible: true, items }] });
const ids = (...names: string[]) => new Set(names);
const boxOf = (s: DocState, id: string) => itemBounds(s.layers[0].items.find((it) => it.id === id)!);
const order = (s: DocState) => s.layers[0].items.map((it) => it.id);

describe('align', () => {
  it('aligns left edges to the leftmost item', () => {
    const s = doc(seg('a', 10, 0, 20, 0), seg('b', 30, 5, 50, 5));
    const out = alignItems(s, ids('a', 'b'), 'left');
    expect(boxOf(out, 'b').x).toBeCloseTo(10);
    expect(boxOf(out, 'a').x).toBeCloseTo(10);
  });

  it('centres horizontally and aligns the bottoms', () => {
    const s = doc(seg('a', 0, 0, 10, 0), seg('b', 40, 20, 60, 20));
    const centred = alignItems(s, ids('a', 'b'), 'hcenter');
    expect(boxOf(centred, 'a').x + boxOf(centred, 'a').w / 2).toBeCloseTo(boxOf(centred, 'b').x + boxOf(centred, 'b').w / 2);
    const bottom = alignItems(s, ids('a', 'b'), 'bottom');
    expect(boxOf(bottom, 'a').y + boxOf(bottom, 'a').h).toBeCloseTo(boxOf(bottom, 'b').y + boxOf(bottom, 'b').h);
  });

  it('does nothing to a single item', () => {
    const s = doc(seg('a', 10, 0, 20, 0));
    expect(alignItems(s, ids('a'), 'left')).toBe(s);
  });
});

describe('distribute', () => {
  it('spaces the middle item evenly between the outer two', () => {
    const s = doc(seg('a', 0, 0, 10, 0), seg('b', 12, 0, 22, 0), seg('c', 80, 0, 90, 0));
    const out = distributeItems(s, ids('a', 'b', 'c'), 'x');
    expect(boxOf(out, 'a').x).toBeCloseTo(0);
    expect(boxOf(out, 'c').x).toBeCloseTo(80);
    expect(boxOf(out, 'b').x + boxOf(out, 'b').w / 2).toBeCloseTo(45);
  });

  it('needs three items', () => {
    const s = doc(seg('a', 0, 0, 10, 0), seg('b', 80, 0, 90, 0));
    expect(distributeItems(s, ids('a', 'b'), 'x')).toBe(s);
  });
});

describe('flip', () => {
  it('mirrors the selection across its own centre', () => {
    const s = doc(seg('a', 0, 0, 10, 0));
    const out = flipItems(s, ids('a'), 'x');
    const b = boxOf(out, 'a');
    expect(b.x).toBeCloseTo(0);
    expect(b.w).toBeCloseTo(10);
    const flippedY = flipItems(s, ids('a'), 'y');
    expect(boxOf(flippedY, 'a').y).toBeCloseTo(0);
  });

  it('keeps the box in place when flipping the whole selection', () => {
    const s = doc(seg('a', 0, 0, 10, 0), seg('b', 40, 0, 50, 0));
    const out = flipItems(s, ids('a', 'b'), 'x');
    expect(unionBox([boxOf(out, 'a'), boxOf(out, 'b')]).x).toBeCloseTo(0);
    expect(boxOf(out, 'a').x).toBeCloseTo(40);
  });
});

describe('z-order', () => {
  const s = doc(seg('a', 0, 0, 1, 0), seg('b', 0, 0, 1, 0), seg('c', 0, 0, 1, 0), seg('d', 0, 0, 1, 0));

  it('brings to front and sends to back, keeping the selected order', () => {
    expect(order(reorderItems(s, ids('a', 'c'), 'front'))).toEqual(['b', 'd', 'a', 'c']);
    expect(order(reorderItems(s, ids('b', 'd'), 'back'))).toEqual(['b', 'd', 'a', 'c']);
  });

  it('moves one step forward or backward past the neighbour', () => {
    expect(order(reorderItems(s, ids('b'), 'forward'))).toEqual(['a', 'c', 'b', 'd']);
    expect(order(reorderItems(s, ids('c'), 'backward'))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('does not pass another selected item when stepping', () => {
    expect(order(reorderItems(s, ids('a', 'b'), 'forward'))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('stays put at the top or bottom', () => {
    expect(order(reorderItems(s, ids('d'), 'forward'))).toEqual(['a', 'b', 'c', 'd']);
  });
});
