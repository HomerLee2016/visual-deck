import { esc, num } from './format';
import { gradientKey } from './paint';
import type { Gradient } from '../types';
import type { SvgEnv } from './types';

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
