import { describe, expect, it } from 'vitest';
import { deleteNodes, insertNode, moveHandle, moveNodes, nearestSegment, setSmooth } from './nodes';
import type { PathItem } from './types';

const style = { color: '#fff', width: 1 };
const open = (...pts: [number, number][]): PathItem => ({
  kind: 'path',
  id: 'p',
  subs: [{ nodes: pts.map(([x, y]) => ({ p: { x, y } })), closed: false }],
  style,
});

describe('node editing', () => {
  it('moves selected nodes with their handles', () => {
    const it: PathItem = { ...open([0, 0], [10, 0]), subs: [{ closed: false, nodes: [{ p: { x: 0, y: 0 }, out: { x: 3, y: 3 } }, { p: { x: 10, y: 0 } }] }] };
    const moved = moveNodes(it, new Set(['0.0']), 5, 5);
    expect(moved.subs[0].nodes[0]).toEqual({ p: { x: 5, y: 5 }, out: { x: 8, y: 8 } });
    expect(moved.subs[0].nodes[1]).toEqual({ p: { x: 10, y: 0 } });
  });

  it('mirrors the other handle of a smooth node', () => {
    const it: PathItem = {
      ...open([0, 0]),
      subs: [{ closed: false, nodes: [{ p: { x: 10, y: 0 }, in: { x: 8, y: 0 }, out: { x: 12, y: 0 } }] }],
    };
    const moved = moveHandle(it, 0, 0, 'out', { x: 10, y: 4 });
    expect(moved.subs[0].nodes[0].in).toEqual({ x: 10, y: -4 });
  });

  it('inserts a node at the midpoint of a straight segment', () => {
    const it = insertNode(open([0, 0], [10, 0]), 0, 0, 0.5);
    expect(it.subs[0].nodes.map((n) => n.p)).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]);
  });

  it('splits a curved segment without moving its curve', () => {
    const curve: PathItem = {
      ...open([0, 0]),
      subs: [{ closed: false, nodes: [{ p: { x: 0, y: 0 }, out: { x: 0, y: 10 } }, { p: { x: 10, y: 0 }, in: { x: 10, y: 10 } }] }],
    };
    const split = insertNode(curve, 0, 0, 0.5);
    const mid = split.subs[0].nodes[1];
    // Midpoint of a symmetric cubic with these controls is (5, 7.5).
    expect(mid.p.x).toBeCloseTo(5);
    expect(mid.p.y).toBeCloseTo(7.5);
  });

  it('deletes nodes and drops subpaths left with none', () => {
    const it = open([0, 0], [10, 0], [20, 0]);
    expect(deleteNodes(it, new Set(['0.1']))!.subs[0].nodes).toHaveLength(2);
    expect(deleteNodes(it, new Set(['0.0', '0.1', '0.2']))).toBeNull();
  });

  it('turns a corner into a smooth node along its neighbours, and back', () => {
    const it = open([0, 0], [10, 0], [20, 0]);
    const smooth = setSmooth(it, new Set(['0.1']), true).subs[0].nodes[1];
    expect(smooth.in!.x).toBeCloseTo(10 - 10 / 3);
    expect(smooth.out!.x).toBeCloseTo(10 + 10 / 3);
    expect(smooth.in!.y).toBeCloseTo(0);
    expect(setSmooth(it, new Set(['0.1']), false).subs[0].nodes[1]).toEqual({ p: { x: 10, y: 0 } });
  });

  it('finds the nearest segment and a parameter on it', () => {
    const near = nearestSegment(open([0, 0], [10, 0], [10, 10]), { x: 10, y: 5 });
    expect(near).toMatchObject({ s: 0, seg: 1 });
    expect(near!.t).toBeCloseTo(0.5, 1);
  });
});
