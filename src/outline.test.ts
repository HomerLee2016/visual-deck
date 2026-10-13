import { describe, expect, it } from 'vitest';
import { itemBounds } from './geometry';
import { offsetPath, polysOf, strokeOutline } from './outline';
import type { PathItem, Pt } from './types';

const zero = { color: '#fff', width: 0 };
/** Rounds away floating-point noise so boxes compare exactly. */
const tidy = (b: { x: number; y: number; w: number; h: number }) => ({ x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) });
const round = (v: number) => Math.round(v * 1e6) / 1e6;
const poly = (pts: Pt[], closed = false) => [{ pts, closed }];
const asPath = (subs: PathItem['subs']): PathItem => ({ kind: 'path', id: 'p', subs, style: zero });
const rect = (x: number, y: number, w: number, h: number): PathItem =>
  asPath([{ closed: true, nodes: [{ p: { x, y } }, { p: { x: x + w, y } }, { p: { x: x + w, y: y + h } }, { p: { x, y: y + h } }] }]);

describe('stroke outline', () => {
  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }];

  it('butt caps stop at the ends of the line', () => {
    const b = itemBounds(asPath(strokeOutline(poly(line), 2, 'butt')));
    expect(b).toEqual({ x: 0, y: -1, w: 10, h: 2 });
  });

  it('round caps extend by half the width', () => {
    const b = itemBounds(asPath(strokeOutline(poly(line), 2, 'round')));
    expect(b.x).toBeCloseTo(-1, 1);
    expect(b.x + b.w).toBeCloseTo(11, 1);
    expect(b.y).toBeCloseTo(-1, 1);
  });

  it('square caps extend by half the width too', () => {
    const b = itemBounds(asPath(strokeOutline(poly(line), 2, 'square')));
    expect(b.x).toBeCloseTo(-1);
    expect(b.x + b.w).toBeCloseTo(11);
  });

  it('gives a closed shape an outer and an inner ring', () => {
    const subs = strokeOutline(polysOf(rect(0, 0, 10, 10))!, 2, 'butt');
    expect(subs).toHaveLength(2);
    expect(tidy(itemBounds(asPath([subs[0]])))).toEqual({ x: -1, y: -1, w: 12, h: 12 });
    expect(tidy(itemBounds(asPath([subs[1]])))).toEqual({ x: 1, y: 1, w: 8, h: 8 });
  });
});

describe('offset path', () => {
  it('grows a closed shape by its distance on every side', () => {
    const grown = offsetPath(rect(0, 0, 10, 10), 2);
    expect(tidy(itemBounds(grown))).toEqual({ x: -2, y: -2, w: 14, h: 14 });
  });

  it('shrinks it with a negative distance', () => {
    const shrunk = offsetPath(rect(0, 0, 10, 10), -2);
    expect(tidy(itemBounds(shrunk))).toEqual({ x: 2, y: 2, w: 6, h: 6 });
  });

  it('keeps corners mitred (square corners stay square when grown)', () => {
    const grown = offsetPath(rect(0, 0, 10, 10), 2);
    const pts = grown.subs[0].nodes.map((n) => ({ x: round(n.p.x), y: round(n.p.y) }));
    expect(pts).toContainEqual({ x: -2, y: -2 });
    expect(pts).toContainEqual({ x: 12, y: 12 });
  });
});
