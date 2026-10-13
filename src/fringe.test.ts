import { describe, expect, it } from 'vitest';
import { DEFAULT_EDGE_OPTIONS, cleanEdge, emptyMask, paintDisc, paintStroke, type EdgeOptions, type Pixels } from './fringe';

/** A w×h bitmap filled with one RGBA colour per pixel, given by `fn(x, y)`. */
function bitmap(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}

const px = (img: Pixels, x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const fullMask = (w: number, h: number) => new Uint8Array(w * h).fill(1);
const opts = (o: Partial<EdgeOptions> = {}): EdgeOptions => ({ ...DEFAULT_EDGE_OPTIONS, ...o });

describe('mask painting', () => {
  it('paints a disc around the centre and nothing outside it', () => {
    const mask = emptyMask(10, 10);
    paintDisc(mask, 10, 10, { x: 5, y: 5 }, 1.5);
    expect(mask[5 * 10 + 5]).toBe(1);
    expect(mask[4 * 10 + 5]).toBe(1);
    expect(mask[0]).toBe(0);
    expect(mask[9 * 10 + 9]).toBe(0);
  });

  it('paints along a stroke without gaps', () => {
    const mask = emptyMask(20, 3);
    paintStroke(mask, 20, 3, { x: 1, y: 1 }, { x: 18, y: 1 }, 1);
    for (let x = 1; x <= 18; x++) expect(mask[20 + x]).toBe(1);
  });
});

describe('cleanEdge', () => {
  it('unmixes a semi-transparent white-blended pixel back to its dark colour', () => {
    // A dark (20,20,20) pixel at alpha 0.5 was blended with white: C = a*F + (1-a)*255.
    const blended = Math.round(0.5 * 20 + 0.5 * 255);
    const img = bitmap(3, 1, (x) => (x === 1 ? [blended, blended, blended, 128] : [0, 0, 0, 0]));
    const out = cleanEdge(img, fullMask(3, 1), opts({ mode: 'remove', lightness: 250 }));
    const [r, g, b, a] = px(out, 1, 0);
    expect(Math.abs(r - 20)).toBeLessThanOrEqual(2);
    expect(Math.abs(g - 20)).toBeLessThanOrEqual(2);
    expect(Math.abs(b - 20)).toBeLessThanOrEqual(2);
    expect(a).toBe(128);
  });

  it('makes light edge pixels transparent in remove mode', () => {
    // Column 0 transparent, column 1 opaque white (the fringe), column 2 opaque dark outline.
    const img = bitmap(4, 1, (x) => (x === 0 ? [0, 0, 0, 0] : x === 1 ? [255, 255, 255, 255] : [30, 30, 30, 255]));
    const out = cleanEdge(img, fullMask(4, 1), opts({ mode: 'remove', band: 2 }));
    expect(px(out, 1, 0)[3]).toBe(0);
    expect(px(out, 2, 0)).toEqual([30, 30, 30, 255]);
  });

  it('fills light edge pixels with the nearest darker colour in fill mode', () => {
    const img = bitmap(4, 1, (x) => (x === 0 ? [0, 0, 0, 0] : x === 1 ? [255, 255, 255, 255] : [30, 30, 30, 255]));
    const out = cleanEdge(img, fullMask(4, 1), opts({ mode: 'fill', band: 2 }));
    expect(px(out, 1, 0)).toEqual([30, 30, 30, 255]);
  });

  it('only touches pixels inside the mask', () => {
    const img = bitmap(4, 1, (x) => (x === 0 ? [0, 0, 0, 0] : [255, 255, 255, 255]));
    const mask = emptyMask(4, 1);
    mask[3] = 1;
    const out = cleanEdge(img, mask, opts({ mode: 'remove', band: 5 }));
    expect(px(out, 1, 0)[3]).toBe(255);
    expect(px(out, 2, 0)[3]).toBe(255);
    expect(px(out, 3, 0)[3]).toBe(0);
  });

  it('leaves light pixels that are too far from transparency alone', () => {
    // A light highlight in the middle of a 12×7 subject: 3+ pixels from any edge or transparency.
    const img = bitmap(12, 7, (x, y) => (x === 0 || x === 11 || y === 0 || y === 6 ? [0, 0, 0, 0] : [255, 255, 255, 255]));
    const out = cleanEdge(img, fullMask(12, 7), opts({ mode: 'remove', band: 2 }));
    expect(px(out, 1, 3)[3]).toBe(0);
    expect(px(out, 6, 3)).toEqual([255, 255, 255, 255]);
  });

  it('treats the area outside the canvas as transparent', () => {
    // A light pixel on the canvas edge, with no transparent pixel inside the canvas, is still fringe.
    const img = bitmap(2, 1, (x) => (x === 0 ? [255, 255, 255, 255] : [30, 30, 30, 255]));
    const out = cleanEdge(img, fullMask(2, 1), opts({ mode: 'remove', band: 1 }));
    expect(px(out, 0, 0)[3]).toBe(0);
    expect(px(out, 1, 0)).toEqual([30, 30, 30, 255]);
  });

  it('does not change the source bitmap', () => {
    const img = bitmap(3, 1, (x) => (x === 0 ? [0, 0, 0, 0] : [255, 255, 255, 255]));
    const before = Array.from(img.data);
    cleanEdge(img, fullMask(3, 1), opts({ mode: 'remove' }));
    expect(Array.from(img.data)).toEqual(before);
  });

  it('keeps dark pixels unchanged', () => {
    const img = bitmap(3, 1, (x) => (x === 0 ? [0, 0, 0, 0] : [40, 40, 40, 255]));
    const out = cleanEdge(img, fullMask(3, 1), opts({ mode: 'fill' }));
    expect(Array.from(out.data)).toEqual(Array.from(img.data));
  });
});
