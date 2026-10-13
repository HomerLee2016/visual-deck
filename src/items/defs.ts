import { esc, num } from './format';
import { gradientKey } from './paint';
import type { Gradient, Style } from '../types';
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
