import { describe, expect, it } from 'vitest';
import { IDENTITY, apply, invert, isIdentity, multiply, scaleOf, transformRect, translation } from './matrix';

describe('matrix', () => {
  it('translates points', () => {
    expect(apply(translation(2, 3), { x: 1, y: 1 })).toEqual({ x: 3, y: 4 });
  });

  it('applies the right-hand matrix first', () => {
    const scale2: [number, number, number, number, number, number] = [2, 0, 0, 2, 0, 0];
    expect(apply(multiply(translation(10, 0), scale2), { x: 1, y: 0 })).toEqual({ x: 12, y: 0 });
    expect(apply(multiply(scale2, translation(10, 0)), { x: 1, y: 0 })).toEqual({ x: 22, y: 0 });
  });

  it('inverts so that a point maps back to itself', () => {
    const m = [2, 1, 0.5, 3, 7, -4] as const;
    const inv = invert(m)!;
    const p = apply(inv, apply(m, { x: 4, y: -9 }));
    expect(p.x).toBeCloseTo(4);
    expect(p.y).toBeCloseTo(-9);
  });

  it('has no inverse when it flattens the plane', () => {
    expect(invert([1, 2, 2, 4, 0, 0])).toBeNull();
  });

  it('reports the average linear scale', () => {
    expect(scaleOf([2, 0, 0, 3, 0, 0])).toBeCloseTo(Math.sqrt(6));
    expect(scaleOf(translation(5, 5))).toBe(1);
  });

  it('bounds a rotated rectangle by its transformed corners', () => {
    const quarterTurn = [0, 1, -1, 0, 0, 0] as const;
    expect(transformRect({ x: 0, y: 0, w: 2, h: 1 }, quarterTurn)).toEqual({ x: -1, y: 0, w: 1, h: 2 });
  });

  it('recognises the identity', () => {
    expect(isIdentity(IDENTITY)).toBe(true);
    expect(isIdentity(multiply(IDENTITY, translation(1, 0)))).toBe(false);
  });
});
