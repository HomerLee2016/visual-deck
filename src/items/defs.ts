import { esc, num } from './format';
import { gradientKey } from './paint';
import { markerMarkup, patternMarkup } from './markers';
import type { ClipSpec, Gradient, Style } from '../types';
import { shapeTypeOf } from './registry';
import { transformAttr } from './shape';
import type { SvgEnv } from './types';

/** The `url(#id)` reference for an SVG filter that blurs and/or drop-shadows an item, registering it once. */
export function filterRef(style: Style, env: SvgEnv): string {
  const key = `filter:${JSON.stringify({ blur: style.blur, shadow: style.shadow })}`;
  let entry = env.defs.get(key);
  if (!entry) {
    const id = `f${env.defs.size + 1}`;
    const blur = style.blur && style.blur > 0 ? `<feGaussianBlur in="SourceGraphic" stdDeviation="${num(style.blur)}" result="b"/>` : '';
    const sh = style.shadow;
    const shadow = sh
      ? `<feDropShadow in="${blur ? 'b' : 'SourceGraphic'}" dx="${num(sh.dx)}" dy="${num(sh.dy)}" stdDeviation="${num(sh.blur)}" flood-color="${esc(sh.color)}"/>`
      : '';
    // The filter region grows so blurred edges and shadows are not clipped.
    const markup = `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">${blur}${shadow || `<feMergeNode in="${blur ? 'b' : 'SourceGraphic'}"/>`}</filter>`;
    entry = { id, markup };
    env.defs.set(key, entry);
  }
  return `url(#${entry.id})`;
}

/** The `url(#id)` reference for a gradient, registering its <defs> entry on first use. */
export function gradientRef(g: Gradient, env: SvgEnv): string {
  const key = gradientKey(g);
  let entry = env.defs.get(key);
  if (!entry) {
    const id = `g${env.defs.size + 1}`;
    const stops = g.stops.map((s) => `<stop offset="${num(s.offset)}" stop-color="${esc(s.color)}"/>`).join('');
    const markup =
      g.type === 'linear'
        ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(g.x1)}" y1="${num(g.y1)}" x2="${num(g.x2)}" y2="${num(g.y2)}">${stops}</linearGradient>`
        : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(g.cx)}" cy="${num(g.cy)}" r="${num(g.r)}" fx="${num(g.fx)}" fy="${num(g.fy)}">${stops}</radialGradient>`;
    entry = { id, markup };
    env.defs.set(key, entry);
  }
  return `url(#${entry.id})`;
}

/** The `url(#id)` reference for a clip path or mask built from a shape, registering it once. */
export function clipRef(clip: ClipSpec, env: SvgEnv): string {
  const key = `${clip.mode}:${JSON.stringify(clip.shape)}`;
  let entry = env.defs.get(key);
  if (!entry) {
    const id = `${clip.mode === 'clip' ? 'c' : 'm'}${env.defs.size + 1}`;
    const shape = `<path d="${shapeTypeOf(clip.shape).pathData(clip.shape)}"${clip.mode === 'mask' ? ' fill="#fff"' : ''}${transformAttr(clip.shape.transform)}/>`;
    const markup = clip.mode === 'clip' ? `<clipPath id="${id}">${shape}</clipPath>` : `<mask id="${id}">${shape}</mask>`;
    entry = { id, markup };
    env.defs.set(key, entry);
  }
  return `url(#${entry.id})`;
}

/** The `url(#id)` reference for a marker of a kind and colour, registering it once. */
export function markerRef(kind: 'arrow' | 'dot', color: string, env: SvgEnv): string {
  const key = `marker:${kind}:${color}`;
  let entry = env.defs.get(key);
  if (!entry) {
    const id = `k${env.defs.size + 1}`;
    entry = { id, markup: markerMarkup(id, kind, color) };
    env.defs.set(key, entry);
  }
  return `url(#${entry.id})`;
}

/** The `url(#id)` reference for a pattern in a colour, registering it once. */
export function patternRef(kind: 'stripes' | 'dots', color: string, env: SvgEnv): string {
  const key = `pattern:${kind}:${color}`;
  let entry = env.defs.get(key);
  if (!entry) {
    const id = `p${env.defs.size + 1}`;
    entry = { id, markup: patternMarkup(id, kind, color) };
    env.defs.set(key, entry);
  }
  return `url(#${entry.id})`;
}
