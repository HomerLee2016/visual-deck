import { describe, expect, it } from 'vitest';
import { buildShape, circle3, dist, flatten, hitTest, itemBounds, norm, rectFromPoints, rectsIntersect, translateItem } from './geometry';
import type { ArcItem, BrushItem, CurveItem, ImageItem, LineItem } from './types';

const style = { color: '#fff', width: 2 };
const line: LineItem = { kind: 'line', id: 'l', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, style };
const brush: BrushItem = {
  kind: 'brush',
  id: 'b',
  pts: [
    { x: 0, y: 0 },
    { x: 5, y: 5 },
    { x: 10, y: 5 },
  ],
  style,
};

describe('brush', () => {
  it('flattens to its recorded points', () => {
    expect(flatten(brush)).toEqual(brush.pts);
  });

  it('hit-tests along the stroke, not just at its points', () => {
    expect(hitTest(brush, { x: 7.5, y: 5.5 }, 0.5)).toBe(true);
    expect(hitTest(brush, { x: 0, y: 10 }, 0.5)).toBe(false);
  });

  it('bounds cover the stroke plus half its width', () => {
    expect(itemBounds(brush)).toEqual({ x: -1, y: -1, w: 12, h: 7 });
  });

  it('translates every point', () => {
    const moved = translateItem(brush, 2, 3) as BrushItem;
    expect(moved.pts[0]).toEqual({ x: 2, y: 3 });
    expect(moved.pts[2]).toEqual({ x: 12, y: 8 });
    expect(brush.pts[0]).toEqual({ x: 0, y: 0 });
  });
});

describe('circle3', () => {
  it('finds the circle through three points', () => {
    const c = circle3({ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 })!;
    expect(c.cx).toBeCloseTo(0);
    expect(c.cy).toBeCloseTo(0);
    expect(c.r).toBeCloseTo(1);
  });

  it('returns null for collinear points', () => {
    expect(circle3({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });
});

describe('flatten', () => {
  it('arc starts at a, ends at b and passes through m', () => {
    const arc: ArcItem = { kind: 'arc', id: 'a', a: { x: 1, y: 0 }, b: { x: -1, y: 0 }, m: { x: 0, y: 1 }, style };
    const pts = flatten(arc);
    expect(pts[0].x).toBeCloseTo(1);
    expect(pts[pts.length - 1].x).toBeCloseTo(-1);
    expect(Math.min(...pts.map((p) => Math.hypot(p.x - 0, p.y - 1)))).toBeLessThan(0.05);
  });

  it('arc takes the side that contains m, not the shorter one', () => {
    const arc: ArcItem = { kind: 'arc', id: 'a', a: { x: 1, y: 0 }, b: { x: -1, y: 0 }, m: { x: 0, y: -1 }, style };
    expect(flatten(arc).every((p) => p.y <= 1e-9)).toBe(true);
  });

  it('curve passes through its end points', () => {
    const c: CurveItem = { kind: 'curve', id: 'c', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, c1: { x: 2, y: 8 }, c2: { x: 8, y: 8 }, style };
    const pts = flatten(c);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1].x).toBeCloseTo(10);
    expect(Math.max(...pts.map((p) => p.y))).toBeGreaterThan(5);
  });
});

describe('hit-testing and bounds', () => {
  it('hits near a line but not far away', () => {
    expect(hitTest(line, { x: 5, y: 3 }, 3)).toBe(true);
    expect(hitTest(line, { x: 5, y: 10 }, 3)).toBe(false);
  });

  it('bounds include stroke width', () => {
    expect(itemBounds(line)).toEqual({ x: -1, y: -1, w: 12, h: 2 });
  });

  it('translates without mutating', () => {
    const moved = translateItem(line, 5, 5);
    expect(moved).toMatchObject({ a: { x: 5, y: 5 }, b: { x: 15, y: 5 } });
    expect(line.a).toEqual({ x: 0, y: 0 });
  });
});

describe('buildShape', () => {
  const p = (x: number, y: number) => ({ x, y });
  it('degrades to a line while points are missing', () => {
    expect(buildShape('arc', [p(0, 0), p(1, 1)], style, 'x')?.kind).toBe('line');
    expect(buildShape('curve', [p(0, 0)], style, 'x')).toBeNull();
  });

  it('builds a full curve from four points', () => {
    expect(buildShape('curve', [p(0, 0), p(9, 0), p(1, 1), p(8, 1)], style, 'x')).toMatchObject({
      kind: 'curve',
      c1: p(1, 1),
      c2: p(8, 1),
    });
  });
});

describe('rects', () => {
  it('builds a rect from any two corners', () => {
    expect(rectFromPoints({ x: 10, y: 2 }, { x: 4, y: 8 })).toEqual({ x: 4, y: 2, w: 6, h: 6 });
  });

  it('detects intersection, touching edges included', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectsIntersect(r, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsIntersect(r, { x: 10, y: 10, w: 1, h: 1 })).toBe(true);
    expect(rectsIntersect(r, { x: 11, y: 0, w: 1, h: 1 })).toBe(false);
    expect(rectsIntersect(r, { x: 0, y: -5, w: 1, h: 4 })).toBe(false);
  });
});

describe('dist and norm', () => {
  it('measures distance and wraps angles into [0, 2π)', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(norm(-Math.PI / 2)).toBeCloseTo(1.5 * Math.PI);
    expect(norm(3 * Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe('image hit-testing', () => {
  const img = (alpha: number | 'throw' | 'noctx') =>
    ({
      kind: 'image',
      id: 'i',
      x: 10,
      y: 10,
      canvas: {
        width: 4,
        height: 4,
        getContext: () => {
          if (alpha === 'noctx') return null;
          return {
            getImageData: () => {
              if (alpha === 'throw') throw new Error('tainted');
              return { data: [0, 0, 0, alpha] };
            },
          };
        },
      },
    }) as unknown as ImageItem;

  it('hits only opaque pixels inside the bitmap', () => {
    expect(hitTest(img(255), { x: 11, y: 11 }, 1)).toBe(true);
    expect(hitTest(img(0), { x: 11, y: 11 }, 1)).toBe(false);
    expect(hitTest(img(255), { x: 9, y: 11 }, 1)).toBe(false);
    expect(hitTest(img(255), { x: 14, y: 11 }, 1)).toBe(false);
  });

  it('falls back to a hit when pixels cannot be read', () => {
    expect(hitTest(img('throw'), { x: 11, y: 11 }, 1)).toBe(true);
    expect(hitTest(img('noctx'), { x: 11, y: 11 }, 1)).toBe(true);
  });
});
