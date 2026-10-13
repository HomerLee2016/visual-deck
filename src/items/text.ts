import { num, opacityOf, esc, transformAttr } from './shape';
import type { ItemType } from './types';
import type { Pt, TextItem } from '../types';

/** Line spacing as a multiple of the font size. */
export const LINE_HEIGHT = 1.2;

/** Average glyph width used when no canvas is available to measure with (tests, workers). */
const FALLBACK_GLYPH = 0.6;

let measurer: CanvasRenderingContext2D | null | undefined;
/** Canvas context used only for measuring text, created on first use. */
function measureContext(): CanvasRenderingContext2D | null {
  if (measurer === undefined) {
    measurer = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  return measurer;
}

/** Font settings for new and selected text. */
export type TextStyle = Pick<TextItem, 'font' | 'size' | 'weight' | 'align'>;

export const DEFAULT_TEXT_STYLE: TextStyle = { font: 'sans-serif', size: 24, weight: 400, align: 'left' };

export const fontOf = (it: Pick<TextItem, 'weight' | 'size' | 'font'>) => `${it.weight} ${it.size}px ${it.font}`;

/** Horizontal offset of a line inside a block `width` wide. */
export function alignOffset(align: TextItem['align'], width: number, lineWidth: number): number {
  if (align === 'center') return (width - lineWidth) / 2;
  if (align === 'right') return width - lineWidth;
  return 0;
}

/** Lines of the text with their widths, and the block size. Drawing, bounds and export all use this. */
export function layoutText(it: TextItem): { lines: string[]; widths: number[]; width: number; height: number } {
  const lines = it.text.split('\n');
  const ctx = measureContext();
  let widths: number[];
  if (ctx) {
    ctx.font = fontOf(it);
    widths = lines.map((l) => ctx.measureText(l).width);
  } else {
    widths = lines.map((l) => l.length * it.size * FALLBACK_GLYPH);
  }
  return { lines, widths, width: Math.max(0, ...widths), height: lines.length * it.size * LINE_HEIGHT };
}

export const textType: ItemType<TextItem> = {
  draw(ctx, it) {
    const { lines, widths, width } = layoutText(it);
    ctx.save();
    ctx.globalAlpha = opacityOf(it.style);
    ctx.font = fontOf(it);
    ctx.fillStyle = it.style.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'hanging';
    lines.forEach((line, i) => ctx.fillText(line, it.x + alignOffset(it.align, width, widths[i]), it.y + i * it.size * LINE_HEIGHT));
    ctx.restore();
  },
  bounds(it) {
    const { width, height } = layoutText(it);
    return { x: it.x, y: it.y, w: width, h: height };
  },
  hitTest(it, p, tol) {
    const { width, height } = layoutText(it);
    return p.x >= it.x - tol && p.x <= it.x + width + tol && p.y >= it.y - tol && p.y <= it.y + height + tol;
  },
  translate: (it, dx, dy) => ({ ...it, x: it.x + dx, y: it.y + dy }),
  toSvg(it) {
    const { lines, widths, width } = layoutText(it);
    const spans = lines
      .map((l, i) => {
        const x = it.x + alignOffset(it.align, width, widths[i]);
        return `<tspan x="${num(x)}" y="${num(it.y + i * it.size * LINE_HEIGHT)}">${esc(l)}</tspan>`;
      })
      .join('');
    const fade = opacityOf(it.style) < 1 ? ` opacity="${num(opacityOf(it.style))}"` : '';
    return `<text font-family="${esc(it.font)}" font-size="${num(it.size)}" font-weight="${it.weight}" fill="${esc(it.style.color)}" dominant-baseline="hanging"${fade}${transformAttr(it.transform)}>${spans}</text>`;
  },
  handles(it) {
    const { width, height } = layoutText(it);
    const corners: Pt[] = [
      { x: it.x, y: it.y },
      { x: it.x + width, y: it.y },
      { x: it.x + width, y: it.y + height },
      { x: it.x, y: it.y + height },
    ];
    return corners;
  },
};
