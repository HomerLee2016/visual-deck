/** A stroke colour split into the colour input's hex value and an opacity from 0 to 1. */
export interface ColorParts {
  hex: string;
  alpha: number;
}

const HEX = /^#([0-9a-f]{6})$/i;
const RGBA = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/** Read `#rrggbb` or `rgba(r, g, b, a)`. Other CSS colours fall back to black, opaque. */
export function parseColor(css: string): ColorParts {
  const s = css.trim();
  const hex = HEX.exec(s);
  if (hex) return { hex: `#${hex[1].toLowerCase()}`, alpha: 1 };
  const rgba = RGBA.exec(s);
  if (rgba) {
    const channels = rgba.slice(1, 4).map((v) => Math.min(255, Number(v)));
    const h = channels.map((v) => v.toString(16).padStart(2, '0')).join('');
    const alpha = rgba[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgba[4])));
    return { hex: `#${h}`, alpha };
  }
  return { hex: '#000000', alpha: 1 };
}

/** Combine a `#rrggbb` colour and an opacity. Fully opaque stays plain hex. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  if (a >= 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(a * 100) / 100})`;
}
