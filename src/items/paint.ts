import type { Gradient, Style } from '../types';
import { patternTile } from './markers';

/** Stop colours and offsets are written as SVG and drawn on canvas from one description. */
export const gradientKey = (g: Gradient) => JSON.stringify(g);

/** A canvas gradient for `g`, in the coordinates of the element being drawn. */
export function canvasGradient(ctx: CanvasRenderingContext2D, g: Gradient): CanvasGradient {
  const cg = g.type === 'linear' ? ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2) : ctx.createRadialGradient(g.fx, g.fy, 0, g.cx, g.cy, g.r);
  for (const s of g.stops) cg.addColorStop(Math.min(1, Math.max(0, s.offset)), s.color);
  return cg;
}

/** The paint to fill with: a pattern or gradient when the style has one, else its plain colour. */
export function fillPaint(ctx: CanvasRenderingContext2D, style: Style): string | CanvasGradient | CanvasPattern | null {
  if (style.pattern) return ctx.createPattern(patternTile(style.pattern, style.color), 'repeat');
  if (style.fillGradient) return canvasGradient(ctx, style.fillGradient);
  return style.fill ?? null;
}

/** The paint to stroke with: a gradient when the style has one, else its colour. */
export function strokePaint(ctx: CanvasRenderingContext2D, style: Style): string | CanvasGradient {
  return style.strokeGradient ? canvasGradient(ctx, style.strokeGradient) : style.color;
}
