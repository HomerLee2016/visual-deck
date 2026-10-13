import type { Rect } from './math';
import type { Gradient, GradientStop, Pt } from './types';

/** A gradient spanning a box: linear across its middle, or radial from its centre to its edge. */
export function defaultGradient(kind: 'linear' | 'radial', box: Rect, stops: GradientStop[]): Gradient {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  if (kind === 'linear') {
    return { type: 'linear', x1: box.x, y1: cy, x2: box.x + box.w, y2: cy, stops };
  }
  const r = Math.max(box.w, box.h) / 2;
  return { type: 'radial', cx, cy, r, fx: cx, fy: cy, stops };
}

export type GradientHandle = 'start' | 'end' | 'centre' | 'radius';

/** The points a user drags to reshape a gradient, in the item's own coordinates. */
export function gradientHandles(g: Gradient): { id: GradientHandle; p: Pt }[] {
  if (g.type === 'linear') {
    return [
      { id: 'start', p: { x: g.x1, y: g.y1 } },
      { id: 'end', p: { x: g.x2, y: g.y2 } },
    ];
  }
  return [
    { id: 'centre', p: { x: g.cx, y: g.cy } },
    { id: 'radius', p: { x: g.cx + g.r, y: g.cy } },
  ];
}

/**
 * Drag one handle to `p`. Moving a radial centre carries its focal point with it,
 * so the highlight keeps its place on the shape; the radius is the distance to `p`.
 */
export function moveGradientHandle(g: Gradient, id: GradientHandle, p: Pt): Gradient {
  if (g.type === 'linear') {
    if (id === 'start') return { ...g, x1: p.x, y1: p.y };
    if (id === 'end') return { ...g, x2: p.x, y2: p.y };
    return g;
  }
  if (id === 'centre') {
    const dx = p.x - g.cx;
    const dy = p.y - g.cy;
    return { ...g, cx: p.x, cy: p.y, fx: g.fx + dx, fy: g.fy + dy };
  }
  if (id === 'radius') return { ...g, r: Math.max(0.5, Math.hypot(p.x - g.cx, p.y - g.cy)) };
  return g;
}
