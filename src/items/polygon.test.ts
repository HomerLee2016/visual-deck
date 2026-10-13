import { describe, expect, it } from 'vitest';
import { buildShape, clickSpec, hitTest, itemBounds } from '../geometry';
import { toSvg } from '../svg';
import { polygonVertices } from './polygon';
import { DEFAULT_SHAPE_PARAMS } from './types';
import type { PolygonItem } from '../types';

const style = { color: '#fff', width: 2 };
const params = { ...DEFAULT_SHAPE_PARAMS, sides: 4, inner: 0.5 };

describe('polygon and star', () => {
  it('places regular vertices on the circle, starting at the given angle', () => {
    const v = polygonVertices(0, 0, 10, 4, 0);
    expect(v).toHaveLength(4);
    expect(v[0].x).toBeCloseTo(10);
    expect(v[0].y).toBeCloseTo(0);
    expect(v[1].x).toBeCloseTo(0);
    expect(v[1].y).toBeCloseTo(10);
  });

  it('alternates outer and inner radii for a star', () => {
    const v = polygonVertices(0, 0, 10, 5, 0, 0.5);
    expect(v).toHaveLength(10);
    expect(Math.hypot(v[0].x, v[0].y)).toBeCloseTo(10);
    expect(Math.hypot(v[1].x, v[1].y)).toBeCloseTo(5);
  });

  it('builds from a centre and a vertex: radius and rotation follow the vertex', () => {
    const it = buildShape('polygon', [{ x: 10, y: 10 }, { x: 10, y: 20 }], style, 'p', params);
    expect(it).toMatchObject({ kind: 'polygon', cx: 10, cy: 10, sides: 4 });
    expect((it as PolygonItem).r).toBeCloseTo(10);
    expect((it as PolygonItem).rot).toBeCloseTo(Math.PI / 2);
  });

  it('builds a star with the requested points and inner radius', () => {
    const it = buildShape('star', [{ x: 0, y: 0 }, { x: 0, y: 10 }], style, 's', params);
    expect(it).toMatchObject({ kind: 'star', sides: 4, inner: 0.5 });
  });

  it('snaps the vertex direction to 15 degree steps when constrained', () => {
    const snap = clickSpec('polygon').constrain!;
    const p = snap({ x: 0, y: 0 }, { x: 10, y: 1 });
    expect(p.y).toBeCloseTo(0); // about 5.7 degrees rounds to 0
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.hypot(10, 1)); // distance is kept
    const q = snap({ x: 0, y: 0 }, { x: 10, y: 10 });
    expect(q.x).toBeCloseTo(q.y); // 45 degrees stays a diagonal
  });

  it('hit-tests the closed outline and bounds the vertices', () => {
    const it = buildShape('polygon', [{ x: 0, y: 0 }, { x: 10, y: 0 }], style, 'p', params)!;
    expect(hitTest(it, { x: -10, y: 0 }, 0.5)).toBe(true); // the far edge of the square
    expect(hitTest(it, { x: 0, y: 0 }, 0.5)).toBe(false);
    expect(itemBounds(it).x).toBeCloseTo(-11);
  });

  it('exports a closed path', () => {
    const it = buildShape('polygon', [{ x: 0, y: 0 }, { x: 10, y: 0 }], style, 'p', params)!;
    const svg = toSvg({ width: 20, height: 20, layers: [{ id: 'l', name: 'L', visible: true, items: [it] }] });
    expect(svg).toMatch(/d="M10 0 L0 10 L-10 0 L0 -10 Z"/);
  });
});
