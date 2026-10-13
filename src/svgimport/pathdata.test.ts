import { describe, expect, it } from 'vitest';
import { parsePathData } from './pathdata';

const pts = (d: string) => parsePathData(d).map((s) => s.nodes.map((n) => [n.p.x, n.p.y]));

describe('path data', () => {
  it('reads absolute and relative lines, with implicit repeats', () => {
    expect(pts('M0 0 L10 0 20 0')).toEqual([[[0, 0], [10, 0], [20, 0]]]);
    expect(pts('m5 5 l10 0 0 10')).toEqual([[[5, 5], [15, 5], [15, 15]]]);
  });

  it('reads horizontal and vertical moves', () => {
    expect(pts('M0 0 H10 V10')).toEqual([[[0, 0], [10, 0], [10, 10]]]);
  });

  it('keeps cubic handles on the nodes they belong to', () => {
    const [sub] = parsePathData('M0 0 C1 2 3 4 5 6');
    expect(sub.nodes[0].out).toEqual({ x: 1, y: 2 });
    expect(sub.nodes[1].in).toEqual({ x: 3, y: 4 });
    expect(sub.nodes[1].p).toEqual({ x: 5, y: 6 });
  });

  it('reflects the previous control point for smooth curves', () => {
    const [sub] = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
    expect(sub.nodes[2].p).toEqual({ x: 20, y: 0 });
    expect(sub.nodes[1].out).toEqual({ x: 10, y: -10 }); // reflection of (10,10) about (10,0)
  });

  it('converts quadratics to cubics that pass through the same end points', () => {
    const [sub] = parsePathData('M0 0 Q5 10 10 0');
    expect(sub.nodes[1].p).toEqual({ x: 10, y: 0 });
    expect(sub.nodes[0].out!.x).toBeCloseTo((2 / 3) * 5);
    expect(sub.nodes[0].out!.y).toBeCloseTo((2 / 3) * 10);
  });

  it('closes subpaths and starts the next one at the start point', () => {
    const subs = parsePathData('M0 0 L10 0 L10 10 Z M20 20 L30 20');
    expect(subs).toHaveLength(2);
    expect(subs[0].closed).toBe(true);
    expect(subs[1].nodes[0].p).toEqual({ x: 20, y: 20 });
  });

  it('reads arcs with compact flags into cubics that end on the arc end point', () => {
    const [sub] = parsePathData('M0 0 A10 10 0 0 1 20 0');
    const last = sub.nodes[sub.nodes.length - 1].p;
    expect(last.x).toBeCloseTo(20);
    expect(last.y).toBeCloseTo(0);
    // Every node sits on the circle of radius 10 centred at (10, 0).
    for (const n of sub.nodes) expect(Math.hypot(n.p.x - 10, n.p.y)).toBeCloseTo(10, 5);
  });

  it('reads compact arc flags written without spaces', () => {
    const [sub] = parsePathData('M0 0a10 10 0 0120 0');
    expect(sub.nodes[sub.nodes.length - 1].p.x).toBeCloseTo(20);
  });

  it('rejects data that does not start with a command', () => {
    expect(() => parsePathData('10 10')).toThrow();
  });
});
