import type { Pt, PathNode, SubPath } from '../types';

/** Splits path data into command letters and numbers. Arc flags are read one digit at a time (they may run together). */
class Scanner {
  private i = 0;
  constructor(private s: string) {}

  private skip() {
    while (this.i < this.s.length && /[\s,]/.test(this.s[this.i])) this.i++;
  }

  done(): boolean {
    this.skip();
    return this.i >= this.s.length;
  }

  /** The next command letter, if the next token is one. */
  command(): string | null {
    this.skip();
    const c = this.s[this.i];
    if (c && /[MmLlHhVvCcSsQqTtAaZz]/.test(c)) {
      this.i++;
      return c;
    }
    return null;
  }

  /** Whether a number (not a command) comes next. */
  hasNumber(): boolean {
    this.skip();
    return /[-+.\d]/.test(this.s[this.i] ?? '');
  }

  number(): number {
    this.skip();
    const m = /^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/.exec(this.s.slice(this.i));
    if (!m) throw new Error(`Bad number in path data at ${this.i}`);
    this.i += m[0].length;
    return Number(m[0]);
  }

  flag(): boolean {
    this.skip();
    const c = this.s[this.i];
    if (c !== '0' && c !== '1') throw new Error(`Bad arc flag at ${this.i}`);
    this.i++;
    return c === '1';
  }
}

const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Cubic segments approximating the elliptical arc from `p0` to `p1` (SVG endpoint parameterisation). */
export function arcCubics(p0: Pt, rx0: number, ry0: number, phiDeg: number, large: boolean, sweep: boolean, p1: Pt): { c1: Pt; c2: Pt; p: Pt }[] {
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (coef * -ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (p0.x + p1.x) / 2;
  const cy = sin * cxp + cos * cyp + (p0.y + p1.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const pt = (t: number): Pt => ({ x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos });
  const deriv = (t: number): Pt => ({ x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos });
  const out: { c1: Pt; c2: Pt; p: Pt }[] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + step * i;
    const b = a + step;
    const pa = pt(a);
    const pb = pt(b);
    const da = deriv(a);
    const db = deriv(b);
    out.push({
      c1: { x: pa.x + k * da.x, y: pa.y + k * da.y },
      c2: { x: pb.x - k * db.x, y: pb.y - k * db.y },
      p: pb,
    });
  }
  if (out.length) out[out.length - 1].p = { ...p1 };
  return out;
}

/**
 * Path data as subpaths of nodes with handles. Straight segments make corner
 * nodes; curves (and quadratics, converted to cubics) set handles; arcs become
 * cubics. Relative commands, implicit repeats and compact arc flags are handled.
 */
export function parsePathData(d: string): SubPath[] {
  const sc = new Scanner(d);
  const subs: SubPath[] = [];
  let sub: SubPath | null = null;
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let lastCubicCtrl: Pt | null = null;
  let lastQuadCtrl: Pt | null = null;
  let cmd = '';

  const open = () => {
    if (!sub) {
      sub = { nodes: [{ p: { ...cur } }], closed: false };
      subs.push(sub);
    }
    return sub;
  };
  const addSegment = (to: Pt, c1: Pt | null, c2: Pt | null) => {
    const s = open();
    const last = s.nodes[s.nodes.length - 1];
    if (c1) last.out = c1;
    const node: PathNode = { p: { ...to } };
    if (c2) node.in = c2;
    s.nodes.push(node);
    cur = { ...to };
  };

  while (!sc.done()) {
    const c = sc.command();
    if (c) cmd = c;
    else if (!sc.hasNumber()) throw new Error('Unexpected character in path data');
    else if (cmd === '' || cmd === 'Z' || cmd === 'z') throw new Error('Path data must start with a command');
    // A bare number repeats the previous command; after M it becomes L.
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    const base = (x: number, y: number): Pt => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
    if (upper === 'Z') {
      if (sub) {
        (sub as SubPath).closed = true;
      }
      cur = { ...start };
      sub = null;
      lastCubicCtrl = lastQuadCtrl = null;
      continue;
    }
    const n = arity[upper];
    const args: number[] = [];
    if (upper === 'A') {
      const rx = sc.number();
      const ry = sc.number();
      const rot = sc.number();
      const fa = sc.flag();
      const fs = sc.flag();
      const x = sc.number();
      const y = sc.number();
      const to = base(x, y);
      if (rx === 0 || ry === 0) addSegment(to, null, null);
      else
        for (const seg of arcCubics(cur, rx, ry, rot, fa, fs, to)) addSegment(seg.p, seg.c1, seg.c2);
      lastCubicCtrl = lastQuadCtrl = null;
    } else {
      for (let i = 0; i < n; i++) args.push(sc.number());
      if (upper === 'M') {
        const to = base(args[0], args[1]);
        sub = null;
        cur = to;
        start = { ...to };
        open();
        // Later pairs after M are lines.
        cmd = rel ? 'l' : 'L';
      } else if (upper === 'L') {
        addSegment(base(args[0], args[1]), null, null);
        lastCubicCtrl = lastQuadCtrl = null;
      } else if (upper === 'H') {
        addSegment({ x: rel ? cur.x + args[0] : args[0], y: cur.y }, null, null);
        lastCubicCtrl = lastQuadCtrl = null;
      } else if (upper === 'V') {
        addSegment({ x: cur.x, y: rel ? cur.y + args[0] : args[0] }, null, null);
        lastCubicCtrl = lastQuadCtrl = null;
      } else if (upper === 'C') {
        const c1 = base(args[0], args[1]);
        const c2 = base(args[2], args[3]);
        addSegment(base(args[4], args[5]), c1, c2);
        lastCubicCtrl = c2;
        lastQuadCtrl = null;
      } else if (upper === 'S') {
        const c1: Pt = lastCubicCtrl ? { x: 2 * cur.x - lastCubicCtrl.x, y: 2 * cur.y - lastCubicCtrl.y } : { ...cur };
        const c2 = base(args[0], args[1]);
        addSegment(base(args[2], args[3]), c1, c2);
        lastCubicCtrl = c2;
        lastQuadCtrl = null;
      } else if (upper === 'Q') {
        const q = base(args[0], args[1]);
        const to = base(args[2], args[3]);
        addSegment(to, ...quadToCubic(cur, q, to));
        lastQuadCtrl = q;
        lastCubicCtrl = null;
      } else if (upper === 'T') {
        const q: Pt = lastQuadCtrl ? { x: 2 * cur.x - lastQuadCtrl.x, y: 2 * cur.y - lastQuadCtrl.y } : { ...cur };
        const to = base(args[0], args[1]);
        addSegment(to, ...quadToCubic(cur, q, to));
        lastQuadCtrl = q;
        lastCubicCtrl = null;
      }
    }
  }
  return subs;
}

/** The two cubic handles equivalent to a quadratic with control point `q`. */
function quadToCubic(p0: Pt, q: Pt, p1: Pt): [Pt, Pt] {
  return [
    { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) },
    { x: p1.x + (2 / 3) * (q.x - p1.x), y: p1.y + (2 / 3) * (q.y - p1.y) },
  ];
}
