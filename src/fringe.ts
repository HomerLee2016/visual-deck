import { type Pixels } from './mask';

export interface EdgeOptions {
  /** Colour of the background that was removed, as [r, g, b]. */
  background: [number, number, number];
  /** How far (in pixels) from transparency a pixel may be and still be cleaned. */
  band: number;
  /** Luminance (0-255) above which an edge pixel counts as light fringe. */
  lightness: number;
  /** `remove` makes light fringe transparent; `fill` paints it with the nearest darker colour. */
  mode: 'remove' | 'fill';
}

export const DEFAULT_EDGE_OPTIONS: EdgeOptions = { background: [255, 255, 255], band: 2, lightness: 200, mode: 'fill' };

const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * Distance (4-neighbour steps) from every pixel to the nearest pixel that `isSeed` accepts.
 * With `outsideIsSeed`, the area beyond the canvas counts as seeds too, so border pixels sit one step away.
 */
function distanceTo(width: number, height: number, isSeed: (i: number) => boolean, from: Int32Array, outsideIsSeed = false): Int32Array {
  const dist = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < dist.length; i++) {
    if (isSeed(i)) {
      dist[i] = 0;
      from[i] = i;
      queue[tail++] = i;
    }
  }
  if (outsideIsSeed) {
    for (let i = 0; i < dist.length; i++) {
      const x = i % width;
      const y = (i - x) / width;
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && dist[i] < 0) {
        dist[i] = 1;
        from[i] = i;
        queue[tail++] = i;
      }
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    const next = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
    for (const j of next) {
      if (j >= 0 && dist[j] < 0) {
        dist[j] = dist[i] + 1;
        from[j] = from[i];
        queue[tail++] = j;
      }
    }
  }
  return dist;
}

/**
 * Remove the light fringe left by a background removal. Only pixels inside `mask`
 * and within `band` pixels of transparency are touched. Semi-transparent pixels are
 * unmixed from the old background (F = (C - (1 - a) B) / a); light pixels left after
 * that are made transparent or painted with the nearest darker colour. Returns a new
 * bitmap; `src` is not changed.
 */
export function cleanEdge(src: Pixels, mask: Uint8Array, opts: EdgeOptions): Pixels {
  const { width, height } = src;
  const out: Pixels = { width, height, data: new Uint8ClampedArray(src.data) };
  const d = out.data;
  const n = width * height;
  const toward = new Int32Array(n);
  // The area outside the canvas is transparent, so a fringe touching the canvas edge still counts as edge.
  const dist = distanceTo(width, height, (i) => d[i * 4 + 3] === 0, toward, true);
  const inTarget = (i: number) => mask[i] === 1 && d[i * 4 + 3] > 0 && dist[i] >= 0 && dist[i] <= opts.band;

  const [br, bg, bb] = opts.background;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const a = d[p + 3] / 255;
    if (!inTarget(i) || a === 1) continue;
    d[p] = clamp((d[p] - (1 - a) * br) / a);
    d[p + 1] = clamp((d[p + 1] - (1 - a) * bg) / a);
    d[p + 2] = clamp((d[p + 2] - (1 - a) * bb) / a);
  }

  const light: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inTarget(i) && lum(d, i * 4) > opts.lightness) light.push(i);
  }
  if (opts.mode === 'remove') {
    for (const i of light) d[i * 4 + 3] = 0;
    return out;
  }

  // Fill: each light pixel takes the colour of its nearest opaque, non-light neighbour.
  const isLight = new Uint8Array(n);
  for (const i of light) isLight[i] = 1;
  const source = distanceTo(width, height, (i) => d[i * 4 + 3] > 0 && !isLight[i] && lum(d, i * 4) <= opts.lightness, toward);
  for (const i of light) {
    const s = source[i] >= 0 ? toward[i] : -1;
    if (s < 0) continue;
    const from = s * 4;
    const to = i * 4;
    d[to] = d[from];
    d[to + 1] = d[from + 1];
    d[to + 2] = d[from + 2];
  }
  return out;
}

function clamp(v: number): number {
  return Math.round(Math.min(255, Math.max(0, v)));
}
