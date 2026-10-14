import { describe, expect, it } from 'vitest';
import { contentBounds } from './trim';

/** Build RGBA data for a w×h bitmap with the given [x, y] pixels opaque. */
function bitmap(w: number, h: number, opaque: [number, number][]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const [x, y] of opaque) data[(y * w + x) * 4 + 3] = 255;
  return data;
}

describe('contentBounds', () => {
  it('returns null when every pixel is transparent', () => {
    expect(contentBounds(bitmap(4, 3, []), 4, 3)).toBeNull();
  });

  it('covers a single coloured pixel exactly', () => {
    expect(contentBounds(bitmap(5, 5, [[2, 3]]), 5, 5)).toEqual({ x: 2, y: 3, w: 1, h: 1 });
  });

  it('spans the outermost coloured pixels on both axes', () => {
    expect(contentBounds(bitmap(10, 10, [[1, 2], [7, 4], [3, 8]]), 10, 10)).toEqual({ x: 1, y: 2, w: 7, h: 7 });
  });

  it('ignores pixels with zero alpha even when their colour is set', () => {
    const data = bitmap(4, 4, [[1, 1]]);
    data[(3 * 4 + 3) * 4] = 200; // red channel only, alpha 0
    expect(contentBounds(data, 4, 4)).toEqual({ x: 1, y: 1, w: 1, h: 1 });
  });

  it('counts semi-transparent pixels as coloured', () => {
    const data = bitmap(3, 3, []);
    data[(2 * 3 + 0) * 4 + 3] = 1;
    expect(contentBounds(data, 3, 3)).toEqual({ x: 0, y: 2, w: 1, h: 1 });
  });
});
