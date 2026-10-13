import { describe, expect, it } from 'vitest';
import { toSvg } from './svg';
import type { DocState, Item } from './types';

const style = { color: '#ff0000', width: 2 };
const doc = (items: Item[], visible = true): DocState => ({
  width: 64,
  height: 32,
  layers: [{ id: 'l1', name: 'Layer 1', visible, items }],
});

describe('toSvg', () => {
  it('writes a sized svg root with a viewBox', () => {
    const svg = toSvg(doc([]));
    expect(svg).toContain('width="64" height="32" viewBox="0 0 64 32"');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('exports a line as a stroked path', () => {
    const svg = toSvg(doc([{ kind: 'line', id: 'a', a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, style }]));
    expect(svg).toContain(
      '<path d="M1 2 L3 4" fill="none" stroke="#ff0000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    );
  });

  it('exports a curve as a cubic bezier', () => {
    const svg = toSvg(
      doc([
        {
          kind: 'curve',
          id: 'a',
          a: { x: 0, y: 0 },
          b: { x: 10, y: 0 },
          c1: { x: 2, y: 5 },
          c2: { x: 8, y: 5 },
          style,
        },
      ]),
    );
    expect(svg).toContain('d="M0 0 C2 5 8 5 10 0"');
  });

  it('exports an arc with the flags the canvas arc would use (small arc, clockwise)', () => {
    // Through (0,10) on the circle of radius 10 around the origin: a half circle, increasing angle.
    const svg = toSvg(
      doc([{ kind: 'arc', id: 'a', a: { x: 10, y: 0 }, b: { x: -10, y: 0 }, m: { x: 0, y: 10 }, style }]),
    );
    expect(svg).toContain('d="M10 0 A10 10 0 0 1 -10 0"');
  });

  it('exports an arc with the large-arc and sweep flags for an anticlockwise sweep', () => {
    // Through (-10,0): three quarters of the circle, decreasing angle.
    const svg = toSvg(
      doc([{ kind: 'arc', id: 'a', a: { x: 10, y: 0 }, b: { x: 0, y: 10 }, m: { x: -10, y: 0 }, style }]),
    );
    expect(svg).toContain('d="M10 0 A10 10 0 1 0 0 10"');
  });

  it('skips hidden layers', () => {
    const svg = toSvg(doc([{ kind: 'line', id: 'a', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, style }], false));
    expect(svg).not.toContain('<path');
  });

  it('escapes the stroke colour', () => {
    const svg = toSvg(
      doc([{ kind: 'line', id: 'a', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, style: { color: '"><x', width: 1 } }]),
    );
    expect(svg).toContain('stroke="&#34;&#62;&#60;x"');
  });
});
