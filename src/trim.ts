/** Smallest rectangle (in pixels) covering every non-transparent pixel, or null when the bitmap is empty. */
export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `data` is RGBA as from `getImageData`; a pixel counts as coloured when its alpha is above zero. */
export function contentBounds(data: Uint8ClampedArray, width: number, height: number): PixelBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
