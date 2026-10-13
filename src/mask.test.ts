import { describe, expect, it } from 'vitest';
import { compositeMasked, emptyMask, paintDisc, paintStroke, type Pixels } from './mask';

const solid = (w: number, h: number, rgba: number[]): Pixels => ({
  width: w,
  height: h,
  data: new Uint8ClampedArray(Array.from({ length: w * h }, () => rgba).flat()),
});

describe('mask painting', () => {
  it('paints a disc around the centre and nothing outside it', () => {
    const mask = emptyMask(10, 10);
    paintDisc(mask, 10, 10, { x: 5, y: 5 }, 1.5);
    expect(mask[5 * 10 + 5]).toBe(1);
    expect(mask[4 * 10 + 5]).toBe(1);
    expect(mask[0]).toBe(0);
    expect(mask[9 * 10 + 9]).toBe(0);
  });

  it('removes with value 0', () => {
    const mask = new Uint8Array(9).fill(1);
    paintDisc(mask, 3, 3, { x: 1.5, y: 1.5 }, 1, 0);
    expect(mask[4]).toBe(0);
    expect(mask[0]).toBe(1);
  });

  it('paints along a stroke without gaps', () => {
    const mask = emptyMask(20, 3);
    paintStroke(mask, 20, 3, { x: 1, y: 1 }, { x: 18, y: 1 }, 1);
    for (let x = 1; x <= 18; x++) expect(mask[20 + x]).toBe(1);
  });
});

describe('compositeMasked', () => {
  it('takes the result inside the mask and the original outside it', () => {
    const original = solid(2, 1, [10, 10, 10, 255]);
    const result = solid(2, 1, [200, 200, 200, 255]);
    const out = compositeMasked(original, result, Uint8Array.from([0, 1]));
    expect(Array.from(out.data)).toEqual([10, 10, 10, 255, 200, 200, 200, 255]);
  });

  it('does not change its inputs', () => {
    const original = solid(1, 1, [1, 2, 3, 4]);
    const result = solid(1, 1, [9, 9, 9, 9]);
    compositeMasked(original, result, Uint8Array.from([1]));
    expect(Array.from(original.data)).toEqual([1, 2, 3, 4]);
  });

  it('returns the original unchanged when the mask is empty', () => {
    const original = solid(2, 2, [5, 5, 5, 255]);
    const out = compositeMasked(original, solid(2, 2, [0, 0, 0, 0]), new Uint8Array(4));
    expect(Array.from(out.data)).toEqual(Array.from(original.data));
  });
});
