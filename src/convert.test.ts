import { describe, expect, it } from 'vitest';
import { hitTest, itemBounds } from './geometry';
import { reversePath, simplifyBrush, simplifyPoints, toPath } from './convert';
import type { Item, PathItem, Pt } from './types';

const style = { color: '#fff', width: 1 };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Points sampled along a cubic from node a to node b. */
function sampleSeg(a: { p: Pt; out?: Pt }, b: { p: Pt; in?: Pt }, n = 10): Pt[] {
  const c1 = a.out ?? a.p;
  const c2 = b.in ?? b.p;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return {
      x: u * u * u * a.p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.p.x,
      y: u * u * u * a.p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.p.y,
    };
  });
}

describe('toPath', () => {
  it('turns a line into two corner nodes', () => {
    const it: Item = { kind: 'line', id: 'l', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, style };
    const p = toPath(it, 'p') as PathItem;
    expect(p.kind).toBe('path');
    expect(p.subs[0]).toEqual({ closed: false, nodes: [{ p: { x: 0, y: 0 } }, { p: { x: 10, y: 0 } }] });
  });

  it('keeps a curve exactly, with its handles', () => {
    const it: Item = { kind: 'curve', id: 'c', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, c1: { x: 0, y: 5 }, c2: { x: 10, y: 5 }, style };
    const p = toPath(it, 'p') as PathItem;
    expect(p.subs[0].nodes[0].out).toEqual({ x: 0, y: 5 });
    expect(p.subs[0].nodes[1].in).toEqual({ x: 10, y: 5 });
  });

  it('approximates an arc with cubics that stay on the circle', () => {
    const it: Item = { kind: 'arc', id: 'a', a: { x: 10, y: 0 }, b: { x: -10, y: 0 }, m: { x: 0, y: 10 }, style };
    const p = toPath(it, 'p') as PathItem;
    const nodes = p.subs[0].nodes;
    expect(nodes.length).toBeGreaterThanOrEqual(3); // a half turn needs at least two quarter pieces
    for (let i = 0; i + 1 < nodes.length; i++) {
      for (const q of sampleSeg(nodes[i], nodes[i + 1])) expect(Math.hypot(q.x, q.y)).toBeCloseTo(10, 1);
    }
    expect(nodes[nodes.length - 1].p.x).toBeCloseTo(-10);
  });

  it('gives a rectangle four straight corners when it has no radius', () => {
    const p = toPath({ kind: 'rect', id: 'r', x: 0, y: 0, w: 10, h: 5, r: 0, style }, 'p') as PathItem;
    expect(p.subs[0].closed).toBe(true);
    expect(p.subs[0].nodes.map((n) => n.p)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }]);
  });

  it('rounds the corners of a rectangle with cubics inside its box', () => {
    const p = toPath({ kind: 'rect', id: 'r', x: 0, y: 0, w: 20, h: 10, r: 4, style: { ...style, width: 0 } }, 'p') as PathItem;
    expect(itemBounds(p)).toEqual({ x: 0, y: 0, w: 20, h: 10 }); // handles stay inside the box
    const nodes = p.subs[0].nodes;
    const curves = nodes.map((n, i) => sampleSeg(n, nodes[(i + 1) % nodes.length]));
    for (const c of curves) for (const q of c) expect(q.x).toBeGreaterThanOrEqual(-1e-9);
    expect(hitTest(p, { x: 0, y: 0 }, 0.5)).toBe(false); // the cut corner is not on the outline
  });

  it('keeps an ellipse on its box, touching all four extremes', () => {
    const p = toPath({ kind: 'ellipse', id: 'e', cx: 0, cy: 0, rx: 10, ry: 5, style: { ...style, width: 0 } }, 'p') as PathItem;
    expect(p.subs[0].nodes).toHaveLength(4);
    const b = itemBounds(p);
    expect(b.x).toBeCloseTo(-10, 0);
    expect(b.w).toBeCloseTo(20, 0);
    expect(b.h).toBeCloseTo(10, 0);
  });

  it('converts polygons and stars to closed corner paths', () => {
    const poly = toPath({ kind: 'polygon', id: 'g', cx: 0, cy: 0, r: 10, sides: 4, rot: 0, style }, 'p') as PathItem;
    expect(poly.subs[0]).toMatchObject({ closed: true });
    expect(poly.subs[0].nodes).toHaveLength(4);
    const star = toPath({ kind: 'star', id: 's', cx: 0, cy: 0, r: 10, sides: 5, inner: 0.5, rot: 0, style }, 'p') as PathItem;
    expect(star.subs[0].nodes).toHaveLength(10);
  });

  it('cannot turn text into a path', () => {
    expect(toPath({ kind: 'text', id: 't', x: 0, y: 0, text: 'a', font: 'serif', size: 10, weight: 400, align: 'left', style }, 'p')).toBeNull();
  });
});

describe('reverse', () => {
  it('walks the path the other way and twice is the original', () => {
    const p: PathItem = {
      kind: 'path',
      id: 'p',
      style,
      subs: [{ closed: false, nodes: [{ p: { x: 0, y: 0 }, out: { x: 1, y: 1 } }, { p: { x: 10, y: 0 }, in: { x: 9, y: 1 } }] }],
    };
    const r = reversePath(p);
    expect(r.subs[0].nodes[0]).toEqual({ p: { x: 10, y: 0 }, out: { x: 9, y: 1 } });
    expect(reversePath(r).subs[0].nodes).toEqual(p.subs[0].nodes);
  });
});

describe('simplify', () => {
  it('drops points within tolerance of a straight run and keeps corners', () => {
    const line: Pt[] = [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 0 }));
    expect(simplifyPoints(line, 0.1)).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }]);
    const corner: Pt[] = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }];
    expect(simplifyPoints(corner, 0.1)).toHaveLength(3);
  });

  it('keeps every point of a wiggle larger than the tolerance', () => {
    const zig: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: 3 }, { x: 2, y: 0 }];
    expect(simplifyPoints(zig, 0.5)).toHaveLength(3);
  });

  it('simplifies a freehand stroke into a path of fewer nodes', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0.01 * (i % 2) }));
    const p = simplifyBrush(pts, style, 'b', 0.5);
    expect(p.subs[0].nodes.length).toBeLessThan(5);
    expect(dist(p.subs[0].nodes[0].p, pts[0])).toBe(0);
  });
});
