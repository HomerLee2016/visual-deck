import { describe, expect, it } from 'vitest';
import { groupItems, ungroupItems } from '../arrange';
import { hitTest, itemBounds, translateItem } from '../geometry';
import { toSvg } from '../svg';
import { translation } from '../matrix';
import type { DocState, GroupItem, Item, LineItem } from '../types';

const style = { color: '#fff', width: 0 };
const seg = (id: string, x0: number, y0: number, x1: number, y1: number): LineItem => ({ kind: 'line', id, a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, style });
const layerOf = (items: Item[]): DocState => ({ width: 100, height: 100, layers: [{ id: 'l', name: 'L', visible: true, items }] });
const doc = (items: LineItem[]) => layerOf(items);
const group = (...items: LineItem[]): GroupItem => ({ kind: 'group', id: 'g', items });

describe('group', () => {
  it('is as large as its children together', () => {
    expect(itemBounds(group(seg('a', 0, 0, 10, 0), seg('b', 20, 5, 30, 5)))).toEqual({ x: 0, y: 0, w: 30, h: 5 });
  });

  it('hit-tests through to its children', () => {
    const g = group(seg('a', 0, 0, 10, 0));
    expect(hitTest(g, { x: 5, y: 0 }, 0.5)).toBe(true);
    expect(hitTest(g, { x: 5, y: 9 }, 0.5)).toBe(false);
  });

  it('moves all children together', () => {
    const moved = translateItem(group(seg('a', 0, 0, 10, 0)), 5, 5) as GroupItem;
    expect(moved.items[0]).toMatchObject({ a: { x: 5, y: 5 }, b: { x: 15, y: 5 } });
  });

  it('exports its children inside a <g> with the group transform', () => {
    const g: GroupItem = { ...group(seg('a', 0, 0, 1, 0)), transform: translation(3, 4) };
    const svg = toSvg(layerOf([g]));
    expect(svg).toContain('<g transform="matrix(1 0 0 1 3 4)"><path d="M0 0 L1 0"');
  });

  it('is empty-sized with no children', () => {
    expect(itemBounds(group())).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe('group and ungroup operations', () => {
  it('groups the selection into one item in the position of the topmost', () => {
    const s = doc([seg('a', 0, 0, 1, 0), seg('b', 0, 0, 1, 0), seg('c', 0, 0, 1, 0)]);
    const out = groupItems(s, new Set(['a', 'c']), 'g');
    expect(out.layers[0].items.map((it) => it.id)).toEqual(['b', 'g']);
    const g = out.layers[0].items[1] as GroupItem;
    expect(g.items.map((it) => it.id)).toEqual(['a', 'c']);
  });

  it('does nothing for a single item', () => {
    const s = doc([seg('a', 0, 0, 1, 0)]);
    expect(groupItems(s, new Set(['a']), 'g')).toBe(s);
  });

  it('ungroups without moving anything on screen', () => {
    const child = { ...seg('a', 0, 0, 10, 0), transform: translation(0, 5) };
    const g: GroupItem = { kind: 'group', id: 'g', items: [child], transform: translation(100, 0) };
    const before = itemBounds(g);
    const out = ungroupItems(layerOf([g]), new Set(['g']));
    const after = out.layers[0].items[0];
    expect(out.layers[0].items.map((it) => it.id)).toEqual(['a']);
    expect(itemBounds(after)).toEqual(before);
  });
});
