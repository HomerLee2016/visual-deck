import { distToSegment, type Rect } from '../math';
import type { Pt, ShapeItem, Style } from '../types';
import type { ClickSpec, ShapeType } from './types';

export const num = (v: number) => String(Math.round(v * 1000) / 1000);
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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
        if (distToSegment(p, pts[i], pts[i + 1]) <= reach) return true;
      }
      return false;
    },
    draw(ctx, it) {
      ctx.save();
      ctx.strokeStyle = it.style.color;
      ctx.lineWidth = it.style.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      def.trace(ctx, it);
      ctx.stroke();
      ctx.restore();
    },
    toSvg(it) {
      const { color, width } = it.style;
      return `<path d="${def.pathData(it)}" fill="none" stroke="${esc(color)}" stroke-width="${num(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    },
  };
}
