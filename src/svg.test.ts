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
  it('leaves shapes unfilled and opaque unless the style says otherwise', () => {
    const svg = toSvg(doc([{ kind: 'line', id: 'a', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, style }]));
    expect(svg).toContain('fill="none"');
    expect(svg).not.toContain('opacity=');
  });

  it('writes line ends, corners, miter limit and dashes from the style', () => {
    const svg = toSvg(
      doc([
        {
          kind: 'line',
          id: 'a',
          a: { x: 0, y: 0 },
          b: { x: 1, y: 1 },
          style: { ...style, cap: 'butt', join: 'miter', miterLimit: 4, dash: [6, 4] },
        },
      ]),
    );
    expect(svg).toContain('stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="4" stroke-dasharray="6 4"');
  });

  it('ignores dash lengths that cannot be drawn', () => {
    const svg = toSvg(
      doc([{ kind: 'line', id: 'a', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, style: { ...style, dash: [0, -1] } }]),
    );
    expect(svg).not.toContain('stroke-dasharray');
  });

  it('writes the item transform as a matrix attribute', () => {
    const svg = toSvg(
      doc([{ kind: 'line', id: 'a', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, style, transform: [1, 0, 0, 1, 5, 6] }]),
    );
    expect(svg).toContain('stroke-linejoin="round" transform="matrix(1 0 0 1 5 6)"/>');
  });

  it('writes fill and opacity from the style', () => {
    const svg = toSvg(
      doc([{ kind: 'line', id: 'a', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, style: { ...style, fill: '#00ff00', opacity: 0.5 } }]),
    );
    expect(svg).toContain('fill="#00ff00"');
    expect(svg).toContain('stroke-linejoin="round" opacity="0.5"/>');
  });

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

  it('exports partial opacity as stroke-opacity', () => {
    const svg = toSvg(doc([{ kind: 'line', id: 'a', a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, style: { color: 'rgba(255, 0, 0, 0.5)', width: 2 } }]));
    expect(svg).toContain('stroke="#ff0000" stroke-opacity="0.5"');
  });

  it('exports a brush stroke as one polyline path', () => {
    const svg = toSvg(
      doc([
        {
          kind: 'brush',
          id: 'a',
          pts: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
            { x: 5, y: 4 },
          ],
          style,
        },
      ]),
    );
    expect(svg).toContain('<path d="M1 2 L3 4 L5 4" fill="none"');
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

  it('never writes an unparsed stroke colour into the markup', () => {
    const svg = toSvg(
      doc([{ kind: 'line', id: 'a', a: { x: 0, y: 0 }, b: { x: 1, y: 1 }, style: { color: '"><x', width: 1 } }]),
    );
    expect(svg).toContain('stroke="#000000"');
    expect(svg).not.toContain('"><x');
  });
});
