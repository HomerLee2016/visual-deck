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

  it('gives every click tool a label and a next-point hint', () => {
    expect(shapeTypeOf('arc').clicks?.label).toBe('Arc');
    expect(shapeTypeOf('curve').clicks?.hint(2)).toBe('Click control point 1');
    expect(shapeTypeOf('curve').clicks?.hint(3)).toBe('Click control point 2');
  });

  it('dispatches images to their own behaviour', () => {
    const canvas = { width: 4, height: 2, toDataURL: () => 'data:image/png;base64,AAA' } as unknown as HTMLCanvasElement;
    const img = { kind: 'image', id: 'x', x: 1.23456, y: 0, canvas } as const;
    expect(typeOf(img).bounds(img)).toEqual({ x: 1.23456, y: 0, w: 4, h: 2 });
    expect(typeOf(img).handles(img)).toEqual([]);
    expect(typeOf(img).toSvg(img, new Map())).toBe(
      '<image x="1.235" y="0" width="4" height="2" href="data:image/png;base64,AAA"/>',
    );
  });
});
