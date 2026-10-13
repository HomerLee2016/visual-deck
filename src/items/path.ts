import type { Pt, PathItem, PathNode, SubPath } from '../types';
import { defineShape, num } from './shape';

/** Separates subpaths inside one outline. Hit-testing and bounds skip NaN points. */
export const BREAK: Pt = { x: NaN, y: NaN };

/** Control points of the segment from `a` to `b`, or null when it is straight (neither node has a handle). */
function cubicOf(a: PathNode, b: PathNode): { c1: Pt; c2: Pt } | null {
  if (!a.out && !b.in) return null;
  return { c1: a.out ?? a.p, c2: b.in ?? b.p };
}

/** Segments of a subpath as (from, to) node pairs; closed subpaths include the closing segment. */
function segmentsOf(sub: SubPath): [PathNode, PathNode][] {
  const n = sub.nodes;
  const out: [PathNode, PathNode][] = [];
  for (let i = 0; i + 1 < n.length; i++) out.push([n[i], n[i + 1]]);
  if (sub.closed && n.length >= 2) out.push([n[n.length - 1], n[0]]);
  return out;
}

/** Polyline approximation of a subpath, sampling curved segments. */
export function flattenSub(sub: SubPath, steps = 16): Pt[] {
  const pts: Pt[] = sub.nodes.length ? [sub.nodes[0].p] : [];
  for (const [a, b] of segmentsOf(sub)) {
    const k = cubicOf(a, b);
    if (!k) {
      pts.push(b.p);
      continue;
    }
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const w0 = u * u * u;
      const w1 = 3 * u * u * t;
      const w2 = 3 * u * t * t;
      const w3 = t * t * t;
      pts.push({
        x: w0 * a.p.x + w1 * k.c1.x + w2 * k.c2.x + w3 * b.p.x,
        y: w0 * a.p.y + w1 * k.c1.y + w2 * k.c2.y + w3 * b.p.y,
      });
    }
  }
  return pts;
}

/** Every subpath's outline, joined with BREAK points. */
function outlineOf(it: PathItem): Pt[] {
  const out: Pt[] = [];
  it.subs.forEach((sub, i) => {
    if (i > 0) out.push(BREAK);
    out.push(...flattenSub(sub));
  });
  return out;
}

const mapNode = (n: PathNode, fn: (p: Pt) => Pt): PathNode => ({
  p: fn(n.p),
  ...(n.in ? { in: fn(n.in) } : {}),
  ...(n.out ? { out: fn(n.out) } : {}),
});

export const pathType = defineShape<PathItem>({
  outline: outlineOf,
  trace(ctx, it) {
    for (const sub of it.subs) {
      if (sub.nodes.length === 0) continue;
      ctx.moveTo(sub.nodes[0].p.x, sub.nodes[0].p.y);
      for (const [a, b] of segmentsOf(sub)) {
        const k = cubicOf(a, b);
        if (k) ctx.bezierCurveTo(k.c1.x, k.c1.y, k.c2.x, k.c2.y, b.p.x, b.p.y);
        else ctx.lineTo(b.p.x, b.p.y);
      }
      if (sub.closed) ctx.closePath();
    }
  },
  pathData(it) {
    return it.subs
      .filter((sub) => sub.nodes.length > 0)
      .map((sub) => {
        const parts = [`M${num(sub.nodes[0].p.x)} ${num(sub.nodes[0].p.y)}`];
        for (const [a, b] of segmentsOf(sub)) {
          const k = cubicOf(a, b);
          parts.push(
            k
              ? `C${num(k.c1.x)} ${num(k.c1.y)} ${num(k.c2.x)} ${num(k.c2.y)} ${num(b.p.x)} ${num(b.p.y)}`
              : `L${num(b.p.x)} ${num(b.p.y)}`,
          );
        }
        if (sub.closed) parts.push('Z');
        return parts.join(' ');
      })
      .join(' ');
  },
  mapPoints: (it, fn) => ({ ...it, subs: it.subs.map((sub) => ({ ...sub, nodes: sub.nodes.map((n) => mapNode(n, fn)) })) }),
  handles: (it) => it.subs.flatMap((sub) => sub.nodes.map((n) => n.p)),
});
