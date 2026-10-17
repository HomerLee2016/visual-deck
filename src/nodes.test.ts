import { describe, expect, it } from 'vitest';
import { deleteNodes, insertNode, moveHandle, moveNodes, nearestNodeHit, nearestSegment, nodeDeltaToLocal, nodeScale, nodeToDoc, nodeToLocal, nodesInLasso, nodesInRect, setSmooth } from './nodes';
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

  it('prefers the node over the handles that sit beside it', () => {
    // Traced paths put each handle about a unit from its node, closer than the pick tolerance.
    const it: PathItem = {
      ...open([0, 0], [10, 0]),
      subs: [{ closed: true, nodes: [
        { p: { x: 0, y: 0 }, in: { x: -1, y: 0 }, out: { x: 1, y: 0 } },
        { p: { x: 10, y: 0 }, in: { x: 9, y: 0 }, out: { x: 11, y: 0 } },
        { p: { x: 20, y: 0 }, in: { x: 19, y: 0 }, out: { x: 21, y: 0 } },
      ] }],
    };
    expect(nearestNodeHit(it, { x: 10, y: 0 }, 6)).toEqual({ s: 0, n: 1, which: null });
    expect(nearestNodeHit(it, { x: 11.2, y: 0 }, 6)).toEqual({ s: 0, n: 1, which: null });
    expect(nearestNodeHit(it, { x: 11, y: 0 }, 6)).toEqual({ s: 0, n: 1, which: null });
    // A handle that is far from its node (hand-drawn paths) still wins where it is the nearest thing.
    const far: PathItem = { ...open([0, 0]), subs: [{ closed: false, nodes: [{ p: { x: 0, y: 0 }, out: { x: 30, y: 0 } }] }] };
    expect(nearestNodeHit(far, { x: 30, y: 0 }, 6)).toEqual({ s: 0, n: 0, which: 'out' });
    expect(nearestNodeHit(it, { x: 50, y: 50 }, 6)).toBeNull();
  });

  it('selects the nodes inside a box, edges included', () => {
    const it = open([0, 0], [10, 0], [10, 10], [40, 40]);
    expect([...nodesInRect(it, { x: -1, y: -1, w: 12, h: 12 })].sort()).toEqual(['0.0', '0.1', '0.2']);
    expect(nodesInRect(it, { x: 100, y: 100, w: 5, h: 5 }).size).toBe(0);
  });

  it('selects the nodes inside a lasso, and ignores a lasso of fewer than three points', () => {
    const it = open([0, 0], [10, 0], [5, 8], [40, 40]);
    const square = [{ x: -5, y: -5 }, { x: 20, y: -5 }, { x: 20, y: 20 }, { x: -5, y: 20 }];
    expect([...nodesInLasso(it, square)].sort()).toEqual(['0.0', '0.1', '0.2']);
    expect(nodesInLasso(it, [{ x: -5, y: -5 }, { x: 20, y: 20 }]).size).toBe(0);
  });

  it('leaves out nodes in the notch of a concave lasso', () => {
    // A cup opening upwards: its notch is the region above (10, 5).
    const cup = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 10, y: 5 }, { x: 0, y: 20 }];
    expect([...nodesInLasso(open([10, 2], [10, 15]), cup)]).toEqual(['0.0']);
  });
});

describe('nodes under a transform', () => {
  // A path drawn at (100, 50) in its own units, as SVG import gives translated paths.
  const moved: PathItem = { ...open([0, 0], [10, 0]), transform: [1, 0, 0, 1, 100, 50] };

  it('maps document points into the path and back', () => {
    expect(nodeToLocal(moved, { x: 105, y: 52 })).toEqual({ x: 5, y: 2 });
    expect(nodeToDoc(moved, { x: 10, y: 0 })).toEqual({ x: 110, y: 50 });
  });

  it('finds the node under a document pointer', () => {
    expect(nearestNodeHit(moved, nodeToLocal(moved, { x: 110, y: 50 }), 1)).toEqual({ s: 0, n: 1, which: null });
  });

  it('converts document moves and tolerances to the path units', () => {
    const scaled: PathItem = { ...open([0, 0]), transform: [2, 0, 0, 2, 0, 0] };
    expect(nodeDeltaToLocal(scaled, 4, 6)).toEqual({ x: 2, y: 3 });
    expect(nodeScale(scaled)).toBe(2);
    expect(nodeScale(open([0, 0]))).toBe(1);
  });
});
