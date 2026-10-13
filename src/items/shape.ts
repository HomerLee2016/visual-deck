import { parseColor } from '../color';
import { distToSegment, type Rect } from '../math';
import type { Matrix } from '../matrix';
import type { Pt, ShapeItem, Style } from '../types';
import type { ClickSpec, ShapeType, SvgEnv } from './types';
import { fillPaint, strokePaint } from './paint';
import { gradientRef } from './defs';

import { esc, num } from './format';

export { esc, num };

/** Opacity clamped to 0..1; styles saved before opacity existed are fully opaque. */
export const opacityOf = (style: Style) => Math.min(1, Math.max(0, style.opacity ?? 1));

/** Dash lengths that can be drawn: positive numbers only. Empty means solid. */
export const dashOf = (style: Style): number[] => (style.dash ?? []).filter((d) => Number.isFinite(d) && d > 0);

/** `transform` attribute for an item's SVG element, or nothing for the identity. */
export const transformAttr = (m?: Matrix) => (m ? ` transform="matrix(${m.map(num).join(' ')})"` : '');

/** The stroke attributes shared by every stroked shape's SVG element. */
function strokeAttrs(style: Style, env: SvgEnv): string {
  const { color, width, cap = 'round', join = 'round', miterLimit } = style;
  const dash = dashOf(style);
  const limit = miterLimit === undefined ? '' : ` stroke-miterlimit="${num(miterLimit)}"`;
  const dashes = dash.length ? ` stroke-dasharray="${dash.map(num).join(' ')}"` : '';
  const { hex, alpha } = parseColor(color);
  const paint = style.strokeGradient ? gradientRef(style.strokeGradient, env) : esc(hex);
  const opacity = !style.strokeGradient && alpha < 1 ? ` stroke-opacity="${num(alpha)}"` : '';
  return `stroke="${paint}"${opacity} stroke-width="${num(width)}" stroke-linecap="${cap}" stroke-linejoin="${join}"${limit}${dashes}`;
}

/** What a shape kind must say about itself; `defineShape` supplies the stroking, hit-testing and export. */
export interface ShapeDef<T extends ShapeItem> {
  outline(it: T): Pt[];
  trace(ctx: CanvasRenderingContext2D, it: T): void;
  pathData(it: T): string;
  /** Apply `fn` to every point the shape stores (its anchors and control points). */
  mapPoints(it: T, fn: (p: Pt) => Pt): T;
  handles(it: T): Pt[];
  clicks?: ClickSpec;
}

/** Build a full ShapeType from a shape's geometry: stroked drawing, outline hit-testing and SVG export. */
export function defineShape<T extends ShapeItem>(def: ShapeDef<T>): ShapeType<T> {
  return {
    outline: def.outline,
    trace: def.trace,
    pathData: def.pathData,
    handles: def.handles,
    clicks: def.clicks,
    translate: (it, dx, dy) => def.mapPoints(it, (p) => ({ x: p.x + dx, y: p.y + dy })),
    withStyle: (it, style: Style) => ({ ...it, style: { ...style } }),
    bounds(it) {
      const pts = def.outline(it);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of pts) {
        if (Number.isNaN(p.x)) continue; // subpath break
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
      const pad = it.style.width / 2;
      return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 } satisfies Rect;
    },
    hitTest(it, p, tol) {
      // `tol` is in document units (callers pass a screen-pixel tolerance divided by zoom).
      const pts = def.outline(it);
      const reach = tol + it.style.width / 2;
      for (let i = 0; i + 1 < pts.length; i++) {
        if (Number.isNaN(pts[i].x) || Number.isNaN(pts[i + 1].x)) continue; // subpath break
        if (distToSegment(p, pts[i], pts[i + 1]) <= reach) return true;
      }
      return false;
    },
    draw(ctx, it) {
      const { width, cap = 'round', join = 'round', miterLimit } = it.style;
      ctx.save();
      ctx.globalAlpha = opacityOf(it.style);
      const fill = fillPaint(ctx, it.style);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        def.trace(ctx, it);
        ctx.fill();
      }
      ctx.strokeStyle = strokePaint(ctx, it.style);
      ctx.lineWidth = width;
      ctx.lineCap = cap;
      ctx.lineJoin = join;
      ctx.miterLimit = miterLimit ?? 10;
      ctx.setLineDash(dashOf(it.style));
      ctx.beginPath();
      def.trace(ctx, it);
      ctx.stroke();
      ctx.restore();
    },
    toSvg(it, env) {
      const opacity = opacityOf(it.style);
      const fade = opacity < 1 ? ` opacity="${num(opacity)}"` : '';
      const fill = it.style.fillGradient ? gradientRef(it.style.fillGradient, env) : esc(it.style.fill ?? 'none');
      return `<path d="${def.pathData(it)}" fill="${fill}" ${strokeAttrs(it.style, env)}${fade}${transformAttr(it.transform)}/>`;
    },
  };
}
