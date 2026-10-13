import { describe, expect, it } from 'vitest';
import { hitTest, itemBounds, translateItem } from '../geometry';
import { toSvg } from '../svg';
import { alignOffset, layoutText, textType } from './text';
import type { TextItem } from '../types';

const text = (over: Partial<TextItem> = {}): TextItem => ({
  kind: 'text',
  id: 't',
  x: 10,
  y: 20,
  text: 'Hi',
  font: 'sans-serif',
  size: 10,
  weight: 400,
  align: 'left',
  style: { color: '#fff', width: 1 },
  ...over,
});

describe('text', () => {
  it('lays out one line per newline and sizes the block from them', () => {
    const l = layoutText(text({ text: 'abc\nde' }));
    expect(l.lines).toEqual(['abc', 'de']);
    expect(l.height).toBeCloseTo(2 * 10 * 1.2);
  });

  it('aligns shorter lines inside the widest one', () => {
    expect(alignOffset('left', 30, 10)).toBe(0);
    expect(alignOffset('center', 30, 10)).toBe(10);
    expect(alignOffset('right', 30, 10)).toBe(20);
  });

  it('bounds the text box from its anchor', () => {
    const b = itemBounds(text({ text: 'abcd' })); // no canvas in tests: four glyphs at 0.6 em each
    expect(b).toEqual({ x: 10, y: 20, w: 24, h: 12 });
  });

  it('hit-tests anywhere in the block, with tolerance', () => {
    const t = text({ text: 'abcd' });
    expect(hitTest(t, { x: 15, y: 25 }, 0)).toBe(true);
    expect(hitTest(t, { x: 40, y: 25 }, 0)).toBe(false);
    expect(hitTest(t, { x: 40, y: 25 }, 20)).toBe(true);
  });

  it('moves its anchor when translated', () => {
    expect(translateItem(text(), 5, -5)).toMatchObject({ x: 15, y: 15 });
  });

  it('exports one tspan per line, escaped and aligned', () => {
    const svg = toSvg({
      width: 100,
      height: 100,
      layers: [{ id: 'l', name: 'L', visible: true, items: [text({ text: '<a>\nb', align: 'right' })] }],
    });
    expect(svg).toContain('<text font-family="sans-serif" font-size="10" font-weight="400" fill="#fff" dominant-baseline="hanging">');
    // Widths are 18 (for "<a>") and 6 (for "b"), so the shorter line is pushed right by 12.
    expect(svg).toContain('<tspan x="10" y="20">&#60;a&#62;</tspan><tspan x="22" y="32">b</tspan>');
  });

  it('has its box corners as handles', () => {
    expect(textType.handles(text({ text: 'abcd' }))).toHaveLength(4);
  });
});
