import type { Pt } from './types';

/** Any RGBA bitmap; `ImageData` fits this shape, so the logic runs without a DOM. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** A per-pixel selection over the document: 1 where edits are allowed, 0 elsewhere. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

/** A mask with nothing selected: one byte per pixel. */
export function emptyMask(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height);
}

/** A mask that selects every pixel of a width×height document. */
export function wholeCanvas(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height).fill(1) };
}

/**
 * The mask to store for a finished selection. Selecting every pixel is stored as null (the whole canvas),
 * so scripts skip the masked merge. An empty selection is kept: scripts then change nothing.
 */
export function storedMask(draft: Mask): Mask | null {
  return draft.data.every((v) => v === 1) ? null : draft;
}

/** Set `value` (1 to add, 0 to remove) for pixels inside a disc of `radius` around `c`. */
export function paintDisc(mask: Uint8Array, width: number, height: number, c: Pt, radius: number, value = 1): void {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(c.x - radius));
  const x1 = Math.min(width - 1, Math.ceil(c.x + radius));
  const y0 = Math.max(0, Math.floor(c.y - radius));
  const y1 = Math.min(height - 1, Math.ceil(c.y + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - c.x;
      const dy = y + 0.5 - c.y;
      if (dx * dx + dy * dy <= r2) mask[y * width + x] = value;
    }
  }
}

/** Paint discs along the segment a→b, so fast pointer moves leave no gaps. */
export function paintStroke(mask: Uint8Array, width: number, height: number, a: Pt, b: Pt, radius: number, value = 1): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, radius / 2)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    paintDisc(mask, width, height, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, radius, value);
  }
}

/**
 * The result inside the mask and the original outside it. Both bitmaps must be the same size as the mask.
 * Returns a new bitmap; neither input is changed.
 */
export function compositeMasked(original: Pixels, result: Pixels, mask: Uint8Array): Pixels {
  const out = new Uint8ClampedArray(original.data);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1) out.set(result.data.subarray(i * 4, i * 4 + 4), i * 4);
  }
  return { width: original.width, height: original.height, data: out };
}
