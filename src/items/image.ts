import { esc, num } from './shape';
import type { ItemType } from './types';
import type { ImageItem, Pt } from '../types';

/** True if the bitmap is opaque at `p`. Falls back to true when pixels cannot be read. */
function imageAlphaAt(it: ImageItem, p: Pt): boolean {
  const px = Math.floor(p.x - it.x);
  const py = Math.floor(p.y - it.y);
  if (px < 0 || py < 0 || px >= it.canvas.width || py >= it.canvas.height) return false;
  try {
    const ctx = it.canvas.getContext('2d', { willReadFrequently: true });
    return !ctx || ctx.getImageData(px, py, 1, 1).data[3] > 0;
  } catch {
    return true;
  }
}

/** A bitmap placed at (x, y). Not stroked, so it has no style and no handles. */
export const imageType: ItemType<ImageItem> = {
  draw(ctx, it) {
    ctx.drawImage(it.canvas, it.x, it.y);
  },
  bounds: (it) => ({ x: it.x, y: it.y, w: it.canvas.width, h: it.canvas.height }),
  hitTest: (it, p) => imageAlphaAt(it, p),
  translate: (it, dx, dy) => ({ ...it, x: it.x + dx, y: it.y + dy }),
  toSvg(it, hrefs) {
    let href = hrefs.get(it.canvas);
    if (!href) {
      href = it.canvas.toDataURL('image/png');
      hrefs.set(it.canvas, href);
    }
    return `<image x="${num(it.x)}" y="${num(it.y)}" width="${it.canvas.width}" height="${it.canvas.height}" href="${esc(href)}"/>`;
  },
  handles: () => [],
};
