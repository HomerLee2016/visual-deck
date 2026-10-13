import { describe, expect, it } from 'vitest';
import { buildShape, hitTest } from '../geometry';
import { toSvg } from '../svg';
import { squareCorner } from './rect';
import { DEFAULT_SHAPE_PARAMS } from './types';

const style = { color: '#fff', width: 2 };

describe('ellipse', () => {
  it('builds from two opposite corners of its box', () => {
    const it = buildShape('ellipse', [{ x: 10, y: 30 }, { x: 30, y: 10 }], style, 'e', DEFAULT_SHAPE_PARAMS);
    expect(it).toMatchObject({ kind: 'ellipse', cx: 20, cy: 20, rx: 10, ry: 10 });
  });

  it('hit-tests along its outline, not its interior', () => {
    const e = buildShape('ellipse', [{ x: 0, y: 0 }, { x: 40, y: 20 }], style, 'e', DEFAULT_SHAPE_PARAMS)!;
    expect(hitTest(e, { x: 40, y: 10 }, 0.5)).toBe(true); // right-most point
    expect(hitTest(e, { x: 20, y: 10 }, 0.5)).toBe(false); // centre
  });

  it('makes a circle when the corner is constrained to a square', () => {
    const corner = squareCorner({ x: 0, y: 0 }, { x: 40, y: 20 });
    const e = buildShape('ellipse', [{ x: 0, y: 0 }, corner], style, 'e', DEFAULT_SHAPE_PARAMS);
    expect(e).toMatchObject({ rx: 20, ry: 20 });
  });

  it('exports two half-ellipse arcs', () => {
    const e = buildShape('ellipse', [{ x: 0, y: 0 }, { x: 10, y: 4 }], style, 'e', DEFAULT_SHAPE_PARAMS)!;
    const svg = toSvg({ width: 10, height: 4, layers: [{ id: 'l', name: 'L', visible: true, items: [e] }] });
    expect(svg).toContain('d="M0 2 A5 2 0 1 1 10 2 A5 2 0 1 1 0 2 Z"');
  });
});
