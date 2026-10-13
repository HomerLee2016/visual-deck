import type { BrushItem } from '../types';
import { defineShape, num } from './shape';

export const brushType = defineShape<BrushItem>({
  outline: (it) => it.pts,
  trace(ctx, it) {
    it.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  },
  pathData: (it) => it.pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p.x)} ${num(p.y)}`).join(' '),
  mapPoints: (it, fn) => ({ ...it, pts: it.pts.map(fn) }),
  // Brush strokes have too many points for handles; only the bounding box is shown.
  handles: () => [],
});
