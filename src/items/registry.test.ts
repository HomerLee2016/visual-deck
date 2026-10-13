import { describe, expect, it } from 'vitest';
import { register, typeOf } from './registry';
import type { ItemType } from './types';
import type { BrushItem, LineItem } from '../types';

const fake = <T extends LineItem | BrushItem>(tag: string): ItemType<T> => ({
  draw() {},
  bounds: () => ({ x: 0, y: 0, w: 0, h: 0 }),
  hitTest: () => false,
  translate: (it) => it,
  toSvg: () => tag,
  handles: () => [],
});

describe('item registry', () => {
  it('returns the behaviour registered for a kind', () => {
    const line: LineItem = { kind: 'line', id: 'a', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, style: { color: '#fff', width: 1 } };
    register('line', fake<LineItem>('line-type'));
    expect(typeOf(line).toSvg(line, new Map())).toBe('line-type');
  });

  it('refuses to register the same kind twice', () => {
    register('brush', fake<BrushItem>('brush-type'));
    expect(() => register('brush', fake<BrushItem>('again'))).toThrow(/already registered/);
  });

  it('throws for a kind nothing registered', () => {
    const arc = { kind: 'arc', id: 'x', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, m: { x: 0, y: 1 }, style: { color: '#fff', width: 1 } } as const;
    expect(() => typeOf(arc)).toThrow(/No item type registered for "arc"/);
  });
});
