import { multiply, translation, type Matrix } from '../matrix';

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  orange: '#ffa500',
  purple: '#800080',
  brown: '#a52a2a',
  pink: '#ffc0cb',
  navy: '#000080',
  teal: '#008080',
  maroon: '#800000',
  olive: '#808000',
};

/**
 * A transform attribute as one matrix. Functions compose left to right, as in
 * SVG: `translate(10) rotate(90)` applies the rotation first.
 */
export function parseTransform(s: string | null | undefined): Matrix | undefined {
  if (!s) return undefined;
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let found = false;
  for (const match of s.matchAll(re)) {
    found = true;
    const a = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let next: Matrix;
    if (match[1] === 'matrix' && a.length === 6) next = a as unknown as Matrix;
    else if (match[1] === 'translate') next = translation(a[0] ?? 0, a[1] ?? 0);
    else if (match[1] === 'scale') next = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (match[1] === 'rotate') {
      const r = ((a[0] ?? 0) * Math.PI) / 180;
      const rot: Matrix = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
      next = a.length >= 3 ? multiply(translation(a[1], a[2]), multiply(rot, translation(-a[1], -a[2]))) : rot;
    } else if (match[1] === 'skewX') next = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (match[1] === 'skewY') next = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    else continue;
    m = multiply(m, next);
  }
  return found ? m : undefined;
}

/** A colour as `#rrggbb`, `none` for no paint, or null if it is not a colour this app can show. */
export function parseColor(s: string | null | undefined): string | 'none' | null {
  if (s == null) return null;
  const v = s.trim().toLowerCase();
  if (v === 'none' || v === 'transparent') return 'none';
  if (v.startsWith('#')) {
    const h = v.slice(1);
    if (/^[0-9a-f]{3}$/.test(h)) return '#' + h.split('').map((c) => c + c).join('');
    if (/^[0-9a-f]{6}$/.test(h)) return '#' + h;
    return null;
  }
  const rgb = /^rgba?\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)/.exec(v);
  if (rgb) {
    const ch = (t: string) => {
      const n = t.endsWith('%') ? (Number(t.slice(0, -1)) * 255) / 100 : Number(t);
      return Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
    };
    return '#' + ch(rgb[1]) + ch(rgb[2]) + ch(rgb[3]);
  }
  return NAMED[v] ?? null;
}

/** A plain number from a length attribute (px or unitless). Percentages and other units give `fallback`. */
export function parseLength(s: string | null | undefined, fallback: number): number {
  if (s == null) return fallback;
  const m = /^\s*([-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?)\s*(px)?\s*$/.exec(s);
  return m ? Number(m[1]) : fallback;
}

/** Dash lengths from a stroke-dasharray attribute; `none` or nothing means solid. */
export function parseDash(s: string | null | undefined): number[] | undefined {
  if (!s || s.trim() === 'none') return undefined;
  const dash = s.split(/[\s,]+/).filter(Boolean).map((t) => Number(t.replace(/px$/, '')));
  if (dash.some((d) => !Number.isFinite(d) || d < 0) || dash.every((d) => d === 0)) return undefined;
  return dash.length % 2 === 1 ? [...dash, ...dash] : dash;
}
