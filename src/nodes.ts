import type { PathItem, PathNode, Pt, SubPath } from './types';

/** A node is addressed as "subpath.node". */
export const nodeKey = (s: number, n: number) => `${s}.${n}`;
export const parseKey = (k: string): [number, number] => {
  const [s, n] = k.split('.').map(Number);
  return [s, n];
};

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Replace one subpath, leaving the others as they are. */
function withSub(it: PathItem, s: number, sub: SubPath): PathItem {
  return { ...it, subs: it.subs.map((x, i) => (i === s ? sub : x)) };
}

/** Move the selected nodes by (dx, dy). Their handles move with them. */
export function moveNodes(it: PathItem, keys: ReadonlySet<string>, dx: number, dy: number): PathItem {
  const shift = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });
  return {
    ...it,
    subs: it.subs.map((sub, s) => ({
      ...sub,
      nodes: sub.nodes.map((n, i) => {
        if (!keys.has(nodeKey(s, i))) return n;
        return { p: shift(n.p), ...(n.in ? { in: shift(n.in) } : {}), ...(n.out ? { out: shift(n.out) } : {}) };
      }),
    })),
  };
}

/**
 * Drag one handle of a node to `p`. A smooth node (both handles present)
 * keeps its other handle opposite, so the join stays straight.
 */
export function moveHandle(it: PathItem, s: number, n: number, which: 'in' | 'out', p: Pt): PathItem {
  const sub = it.subs[s];
  const node = sub.nodes[n];
  const other = which === 'in' ? 'out' : 'in';
  const mirrored = node[other] ? { x: 2 * node.p.x - p.x, y: 2 * node.p.y - p.y } : undefined;
  const updated: PathNode = { ...node, [which]: p, ...(mirrored && node[other] ? { [other]: mirrored } : {}) };
  return withSub(it, s, { ...sub, nodes: sub.nodes.map((x, i) => (i === n ? updated : x)) });
}

/**
 * Split the segment that starts at node `seg` (of a subpath) at parameter `t`,
 * inserting a node there. Curved segments are split exactly (de Casteljau).
 */
export function insertNode(it: PathItem, s: number, seg: number, t: number): PathItem {
  const sub = it.subs[s];
  const nodes = sub.nodes.map((n) => ({ ...n }));
  const count = nodes.length;
  const isClosingSeg = sub.closed && seg === count - 1;
  const ai = seg;
  const bi = isClosingSeg ? 0 : seg + 1;
  const a = nodes[ai];
  const b = nodes[bi];
  const straight = !a.out && !b.in;
  let mid: PathNode;
  if (straight) {
    mid = { p: lerp(a.p, b.p, t) };
  } else {
    const c1 = a.out ?? a.p;
    const c2 = b.in ?? b.p;
    const p01 = lerp(a.p, c1, t);
    const p12 = lerp(c1, c2, t);
    const p23 = lerp(c2, b.p, t);
    const p012 = lerp(p01, p12, t);
    const p123 = lerp(p12, p23, t);
    const m = lerp(p012, p123, t);
    a.out = p01;
    b.in = p23;
    mid = { p: m, in: p012, out: p123 };
  }
  if (isClosingSeg) {
    nodes.push(mid);
  } else {
    nodes.splice(bi, 0, mid);
  }
  return withSub(it, s, { ...sub, nodes });
}

/** Remove the selected nodes. A subpath left with a single node is dropped; null if nothing remains. */
export function deleteNodes(it: PathItem, keys: ReadonlySet<string>): PathItem | null {
  const subs = it.subs
    .map((sub, s) => ({ ...sub, nodes: sub.nodes.filter((_, i) => !keys.has(nodeKey(s, i))) }))
    .filter((sub) => sub.nodes.length > 0);
  if (subs.length === 0) return null;
  return { ...it, subs: subs.map((sub) => (sub.nodes.length < 2 ? { ...sub, closed: false } : sub)) };
}

/** Make the selected nodes smooth (handles along the neighbours) or corners (no handles). */
export function setSmooth(it: PathItem, keys: ReadonlySet<string>, smooth: boolean): PathItem {
  return {
    ...it,
    subs: it.subs.map((sub, s) => {
      const count = sub.nodes.length;
      const nodes = sub.nodes.map((node, i) => {
        if (!keys.has(nodeKey(s, i))) return node;
        if (!smooth) return { p: node.p };
        const prevI = i > 0 ? i - 1 : sub.closed ? count - 1 : -1;
        const nextI = i < count - 1 ? i + 1 : sub.closed ? 0 : -1;
        const prev = prevI >= 0 && prevI !== i ? sub.nodes[prevI].p : null;
        const next = nextI >= 0 && nextI !== i ? sub.nodes[nextI].p : null;
        if (!prev && !next) return node;
        // Direction through the neighbours (or the one neighbour, at an end of an open subpath).
        const dir = prev && next ? { x: next.x - prev.x, y: next.y - prev.y } : next ? { x: next.x - node.p.x, y: next.y - node.p.y } : { x: node.p.x - prev!.x, y: node.p.y - prev!.y };
        const len = Math.hypot(dir.x, dir.y);
        if (len === 0) return node;
        const u = { x: dir.x / len, y: dir.y / len };
        const inLen = prev ? Math.hypot(node.p.x - prev.x, node.p.y - prev.y) / 3 : 0;
        const outLen = next ? Math.hypot(next.x - node.p.x, next.y - node.p.y) / 3 : 0;
        return {
          p: node.p,
          ...(prev ? { in: { x: node.p.x - u.x * inLen, y: node.p.y - u.y * inLen } } : {}),
          ...(next ? { out: { x: node.p.x + u.x * outLen, y: node.p.y + u.y * outLen } } : {}),
        };
      });
      return { ...sub, nodes };
    }),
  };
}

/**
 * What the node tool grabs at `p`, within `tol`. A handle only wins when it is clearly closer than
 * its node: handles of traced paths sit a unit or two from their node, so without this a click on
 * a node would grab a handle instead.
 */
export function nearestNodeHit(it: PathItem, p: Pt, tol: number): { s: number; n: number; which: 'in' | 'out' | null } | null {
  const hits: { d: number; s: number; n: number; which: 'in' | 'out' | null }[] = [];
  it.subs.forEach((sub, s) =>
    sub.nodes.forEach((node, n) => {
      hits.push({ d: Math.hypot(node.p.x - p.x, node.p.y - p.y), s, n, which: null });
      for (const which of ['in', 'out'] as const) {
        const h = node[which];
        if (h) hits.push({ d: Math.hypot(h.x - p.x, h.y - p.y) + tol / 2, s, n, which });
      }
    }),
  );
  const best = hits.filter((h) => h.d <= tol).sort((a, b) => a.d - b.d)[0];
  return best ? { s: best.s, n: best.n, which: best.which } : null;
}

/** The segment of `it` nearest to `p`: subpath, the segment's start node, and the parameter along it. */
export function nearestSegment(it: PathItem, p: Pt): { s: number; seg: number; t: number; dist: number } | null {
  let best: { s: number; seg: number; t: number; dist: number } | null = null;
  it.subs.forEach((sub, s) => {
    const n = sub.nodes;
    const segs: number[] = [];
    for (let i = 0; i + 1 < n.length; i++) segs.push(i);
    if (sub.closed && n.length >= 2) segs.push(n.length - 1);
    for (const seg of segs) {
      const a = n[seg];
      const b = n[seg === n.length - 1 ? 0 : seg + 1];
      const c1 = a.out ?? a.p;
      const c2 = b.in ?? b.p;
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const q = lerp(lerp(lerp(a.p, c1, t), lerp(c1, c2, t), t), lerp(lerp(c1, c2, t), lerp(c2, b.p, t), t), t);
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (!best || d < best.dist) best = { s, seg, t, dist: d };
      }
    }
  });
  return best;
}
