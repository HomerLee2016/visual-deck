// Trace the active layer into flat colour regions, one editable path per colour on new "Trace" layers.
// Port of trace_to_svg.py. Settings from trace_config.json are inlined as CFG.
// Pipeline: 2x upscale -> denoise -> k-means quantise -> majority filter ->
// contours -> area filter -> simplify -> Catmull-Rom handles -> path nodes.
const CFG = {
  nColors: 10,
  upscale: 2,
  denoiseStrength: 40,
  alphaThreshold: 128,
  kmeansSampleSize: 60000,
  kmeansSeed: 0,
  minRegionArea: 40,
  simplifyEpsilon: 1.0,
  curveTension: 0.1666,
  majorityKernelSize: 5,
  // Each colour region grows this many document pixels under its neighbours, so no gap shows at shared edges.
  regionGrow: 1,
  silhouetteUnderlay: true,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nearest(cent, k, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let c = 0; c < k; c++) {
    const dr = cent[c * 3] - r, dg = cent[c * 3 + 1] - g, db = cent[c * 3 + 2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// k-means++ seeding, then Lloyd iterations. cols is n*3 floats.
function kmeans(cols, n, k, rnd) {
  const cent = new Float64Array(k * 3);
  const d2 = new Float64Array(n).fill(Infinity);
  let pick = Math.floor(rnd() * n);
  for (let c = 0; c < k; c++) {
    cent.set(cols.subarray(pick * 3, pick * 3 + 3), c * 3);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const dr = cols[i * 3] - cent[c * 3], dg = cols[i * 3 + 1] - cent[c * 3 + 1], db = cols[i * 3 + 2] - cent[c * 3 + 2];
      d2[i] = Math.min(d2[i], dr * dr + dg * dg + db * db);
      sum += d2[i];
    }
    let r = rnd() * sum;
    pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= d2[i];
      if (r <= 0) { pick = i; break; }
    }
  }

  const assign = new Int32Array(n).fill(-1);
  for (let it = 0; it < 100; it++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const a = nearest(cent, k, cols[i * 3], cols[i * 3 + 1], cols[i * 3 + 2]);
      if (assign[i] !== a) { assign[i] = a; changed++; }
    }
    if (changed === 0 && it > 0) break;
    const sum = new Float64Array(k * 3), cnt = new Float64Array(k);
    for (let i = 0; i < n; i++) {
      const a = assign[i];
      cnt[a]++;
      for (let ch = 0; ch < 3; ch++) sum[a * 3 + ch] += cols[i * 3 + ch];
    }
    for (let c = 0; c < k; c++) {
      if (cnt[c] === 0) continue;
      for (let ch = 0; ch < 3; ch++) cent[c * 3 + ch] = sum[c * 3 + ch] / cnt[c];
    }
  }

  let inertia = 0;
  for (let i = 0; i < n; i++) {
    const c = assign[i];
    const dr = cols[i * 3] - cent[c * 3], dg = cols[i * 3 + 1] - cent[c * 3 + 1], db = cols[i * 3 + 2] - cent[c * 3 + 2];
    inertia += dr * dr + dg * dg + db * db;
  }
  return { cent, inertia };
}

// Returns labels (Int32Array, -1 = transparent) and a palette of [r, g, b] rounded to 0-255.
function quantise(rgb, opaque, W, H) {
  const ids = [];
  for (let p = 0; p < W * H; p++) if (opaque[p]) ids.push(p);
  const labels = new Int32Array(W * H).fill(-1);
  if (ids.length === 0) return { labels, palette: [] };

  const rnd = mulberry32(CFG.kmeansSeed);
  const m = Math.min(CFG.kmeansSampleSize, ids.length);
  const pool = Int32Array.from(ids);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(rnd() * (pool.length - i));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const cols = new Float64Array(m * 3);
  for (let i = 0; i < m; i++) {
    const p = pool[i] * 3;
    cols[i * 3] = rgb[p]; cols[i * 3 + 1] = rgb[p + 1]; cols[i * 3 + 2] = rgb[p + 2];
  }

  const k = Math.min(CFG.nColors, m);
  let best = null;
  for (let init = 0; init < 3; init++) {
    const r = kmeans(cols, m, k, rnd);
    if (!best || r.inertia < best.inertia) best = r;
  }

  for (const p of ids) {
    labels[p] = nearest(best.cent, k, rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]);
  }
  const palette = [];
  for (let c = 0; c < k; c++) {
    palette.push([0, 1, 2].map((ch) => Math.min(255, Math.max(0, Math.round(best.cent[c * 3 + ch])))));
  }
  return { labels, palette };
}

// Bilateral denoise with a 9px window (radius 4), as cv2.bilateralFilter(d=9).
function denoise(rgb, W, H, sigma) {
  const R = 4, D = 2 * R + 1;
  const spatial = new Float64Array(D * D);
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      spatial[(dy + R) * D + dx + R] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
    }
  }
  const colourK = 1 / (2 * sigma * sigma);
  const out = new Uint8ClampedArray(rgb.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      let sr = 0, sg = 0, sb = 0, sw = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = Math.min(H - 1, Math.max(0, y + dy));
        for (let dx = -R; dx <= R; dx++) {
          const xx = Math.min(W - 1, Math.max(0, x + dx));
          const j = (yy * W + xx) * 3;
          const dr = rgb[j] - rgb[i], dg = rgb[j + 1] - rgb[i + 1], db = rgb[j + 2] - rgb[i + 2];
          const w = spatial[(dy + R) * D + dx + R] * Math.exp(-(dr * dr + dg * dg + db * db) * colourK);
          sr += w * rgb[j]; sg += w * rgb[j + 1]; sb += w * rgb[j + 2]; sw += w;
        }
      }
      out[i] = sr / sw; out[i + 1] = sg / sw; out[i + 2] = sb / sw;
    }
  }
  return out;
}

// Each pixel takes the label most common in its square neighbourhood.
function majorityFilter(labels, n, W, H, size) {
  const r = Math.floor(size / 2);
  const best = new Int32Array(W * H).fill(-1);
  const bestCount = new Int32Array(W * H).fill(-1);
  const I = new Int32Array((W + 1) * (H + 1));
  for (let k = 0; k < n; k++) {
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += labels[y * W + x] === k ? 1 : 0;
        I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row;
      }
    }
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const count = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
        const p = y * W + x;
        if (count > bestCount[p]) { bestCount[p] = count; best[p] = k; }
      }
    }
  }
  for (let p = 0; p < W * H; p++) if (labels[p] < 0) best[p] = -1;
  return best;
}

// Grow a binary mask by r pixels (round disc), keeping only pixels inside clip.
// The disc is one row-span per dy, so each row is a rectangle query on the integral image.
function growMask(mask, clip, W, H, r) {
  const I = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += mask[y * W + x];
      I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row;
    }
  }
  const spans = [];
  for (let dy = -r; dy <= r; dy++) spans.push([dy, Math.floor(Math.sqrt(r * r - dy * dy))]);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (!clip[p]) continue;
      let hit = 0;
      for (const [dy, half] of spans) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        const x0 = Math.max(0, x - half), x1 = Math.min(W, x + half + 1);
        hit += I[(yy + 1) * (W + 1) + x1] - I[yy * (W + 1) + x1] - I[(yy + 1) * (W + 1) + x0] + I[yy * (W + 1) + x0];
        if (hit > 0) break;
      }
      out[p] = hit > 0 ? 1 : 0;
    }
  }
  return out;
}

// Boundary of a binary mask as closed loops of pixel-corner vertices. Outer
// edges and holes both come out as loops; the evenodd fill handles the holes.
function traceLoops(mask, W, H) {
  const VW = W + 1;
  const adj = new Map();
  const from = [], to = [];
  const addEdge = (a, b) => {
    const id = from.length;
    from.push(a); to.push(b);
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(id);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (!mask[p]) continue;
      const tl = y * VW + x, tr = tl + 1, bl = tl + VW, br = bl + 1;
      if (y === 0 || !mask[p - W]) addEdge(tl, tr);
      if (x === W - 1 || !mask[p + 1]) addEdge(tr, br);
      if (y === H - 1 || !mask[p + W]) addEdge(br, bl);
      if (x === 0 || !mask[p - 1]) addEdge(bl, tl);
    }
  }

  const used = new Uint8Array(from.length);
  const loops = [];
  for (let e0 = 0; e0 < from.length; e0++) {
    if (used[e0]) continue;
    const start = from[e0];
    const verts = [];
    let e = e0;
    while (!used[e]) {
      used[e] = 1;
      verts.push(from[e]);
      const v = to[e];
      if (v === start) break;
      const next = (adj.get(v) || []).find((id) => !used[id]);
      if (next === undefined) break;
      e = next;
    }
    loops.push(verts.map((v) => ({ x: v % VW, y: Math.floor(v / VW) })));
  }
  return loops;
}

function loopArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

// Ramer-Douglas-Peucker on an open polyline; keeps both endpoints.
function rdp(pts, eps) {
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const a = pts[i], b = pts[j];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let max = 0, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const p = pts[k];
      const d = len === 0
        ? Math.hypot(p.x - a.x, p.y - a.y)
        : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
      if (d > max) { max = d; idx = k; }
    }
    if (idx >= 0 && max > eps) {
      keep[idx] = 1;
      stack.push([i, idx], [idx, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

// Closed-loop simplify: split at the point farthest from the first, then RDP each half.
function simplifyClosed(pts, eps) {
  if (pts.length < 4) return pts;
  let far = 0, farD = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > farD) { farD = d; far = i; }
  }
  if (far === 0) return pts;
  const first = rdp(pts.slice(0, far + 1), eps);
  const second = rdp([...pts.slice(far), pts[0]], eps);
  return first.slice(0, -1).concat(second.slice(0, -1));
}

// Closed Catmull-Rom spline through pts as path nodes with handles, in document units.
// A node's handles run parallel to the chord between its neighbours, so the curve is smooth.
function loopNodes(pts) {
  const n = pts.length, t = CFG.curveTension, k = 1 / CFG.upscale;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const dx = (b.x - a.x) * t, dy = (b.y - a.y) * t;
    return {
      x: p.x * k, y: p.y * k,
      in: { x: (p.x - dx) * k, y: (p.y - dy) * k },
      out: { x: (p.x + dx) * k, y: (p.y + dy) * k },
    };
  });
}

// Trace one mask into closed subpaths plus its total area. Small regions are dropped.
function tracePath(mask, W, H) {
  const subs = [];
  let area = 0;
  for (const loop of traceLoops(mask, W, H)) {
    const a = loopArea(loop);
    if (a < CFG.minRegionArea) continue;
    const pts = simplifyClosed(loop, CFG.simplifyEpsilon);
    if (pts.length < 3) continue;
    subs.push({ nodes: loopNodes(pts), closed: true });
    area += a;
  }
  return { subs, area };
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

const src = deck.getImageData();
const w0 = src.width, h0 = src.height, s = CFG.upscale;
const W = w0 * s, H = h0 * s;

const opaque = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const sx = Math.floor(x / s), sy = Math.floor(y / s);
    opaque[y * W + x] = src.data[(sy * w0 + sx) * 4 + 3] >= CFG.alphaThreshold ? 1 : 0;
  }
}
if (!opaque.some((v) => v)) {
  deck.log('Trace: active layer is empty');
} else {
  // Bilinear upscale of colour, nearest upscale of the opaque mask.
  const rgb = new Float32Array(W * H * 3);
  const at = (xx, yy, c) => src.data[(yy * w0 + xx) * 4 + c];
  for (let y = 0; y < H; y++) {
    const fy = Math.min(Math.max((y + 0.5) / s - 0.5, 0), h0 - 1);
    const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, h0 - 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(Math.max((x + 0.5) / s - 0.5, 0), w0 - 1);
      const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, w0 - 1), tx = fx - x0;
      for (let c = 0; c < 3; c++) {
        const top = at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx;
        const bot = at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx;
        rgb[(y * W + x) * 3 + c] = top * (1 - ty) + bot * ty;
      }
    }
  }

  const smooth = denoise(rgb, W, H, CFG.denoiseStrength);
  const { labels, palette } = quantise(smooth, opaque, W, H);
  const smoothed = majorityFilter(labels, palette.length, W, H, CFG.majorityKernelSize);

  // Largest colour areas first so small details sit on top.
  const counts = new Array(palette.length).fill(0);
  for (const l of smoothed) if (l >= 0) counts[l]++;
  const base = counts.indexOf(Math.max(...counts));

  const layers = [];
  for (let k = 0; k < palette.length; k++) {
    const mask = smoothed.map((l) => (l === k ? 1 : 0));
    const grown = growMask(mask, opaque, W, H, Math.round(CFG.regionGrow * CFG.upscale));
    const { subs, area } = tracePath(grown, W, H);
    if (subs.length) layers.push({ area, colour: palette[k], subs });
  }
  layers.sort((a, b) => b.area - a.area);
  if (CFG.silhouetteUnderlay) {
    const { subs } = tracePath(opaque, W, H);
    if (subs.length) layers.unshift({ area: Infinity, colour: palette[base], subs });
  }

  // One layer per colour, added bottom-up in draw order. Each colour is a single
  // path item with one subpath per region, so its nodes can be edited directly.
  // Holes need no even-odd rule: contour loops wind opposite to their outer loop.
  for (const layer of layers) {
    const hex = toHex(layer.colour);
    const layerId = deck.addLayer(layer.area === Infinity ? `Trace silhouette ${hex}` : `Trace ${hex}`);
    deck.addPath(layer.subs, { color: hex, width: 0, fill: hex }, layerId);
  }
  deck.log(`Trace: ${palette.length} colours, ${layers.length} layers`);
}
