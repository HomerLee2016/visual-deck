import { describe, expect, it } from 'vitest';
import { shapeTypeOf, typeOf } from './registry';
import { lineType } from './line';
import type { Item } from '../types';

const style = { color: '#fff', width: 1 };

describe('item registry', () => {
  it('returns the behaviour registered for each shape kind', () => {
    const line: Item = { kind: 'line', id: 'a', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, style };
    expect(typeOf(line)).toBe(lineType);
    expect(shapeTypeOf(line).outline(line as never)).toHaveLength(2);
  });

  it('exposes the click spec only for click-placed shapes', () => {
    expect(shapeTypeOf('arc').clicks?.needed).toBe(3);
    expect(shapeTypeOf('curve').clicks?.needed).toBe(4);
    expect(shapeTypeOf('brush').clicks).toBeUndefined();
  });

  it('throws for an item kind that has no behaviour yet', () => {
    const img = { kind: 'image', id: 'x', x: 0, y: 0, canvas: {} as HTMLCanvasElement } as const;
    expect(() => typeOf(img)).toThrow(/No item type registered for "image"/);
  });
});
