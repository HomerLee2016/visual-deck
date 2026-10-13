import { typeOf } from '../items/registry';
import { uid } from '../model';
import type { Matrix } from '../matrix';
import type { GradientStop, Gradient, Item, Pt, Style, SubPath, TextItem, PathItem, LineItem, RectItem, EllipseItem, GroupItem } from '../types';
import { parseColor, parseDash, parseLength, parseTransform } from './attrs';
import { parsePathData } from './pathdata';

export interface SvgImport {
  width: number;
  height: number;
  items: Item[];
  /** Features that were skipped or approximated, for the status line. */
  warnings: string[];
}

/** Paint and stroke settings that children inherit from their groups. */
interface Inherited {
  fill: string | 'none';
  /** Id of a gradient the fill refers to; built once the item's own box is known. */
  fillUrl?: string;
  color: string;
  width: number;
  cap?: Style['cap'];
  join?: Style['join'];
  miterLimit?: number;
  dash?: number[];
  opacity: number;
}

const DEFAULTS: Inherited = { fill: '#000000', color: '#000000', width: 1, opacity: 1 };

/** Element attributes plus `style="…"` declarations, the latter winning (as in SVG). */
function declared(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) out[a.name] = a.value;
  for (const decl of (el.getAttribute('style') ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

/** The id a `url(#id)` paint refers to, or null. */
const urlId = (v: string | undefined) => {
  const m = /^url\(\s*#([^)\s]+)\s*\)/.exec(v ?? '');
  return m ? m[1] : null;
};

/** A gradient element as the app's gradient type. objectBoundingBox coordinates are converted with the item's box. */
function gradientOf(el: Element, box: { x: number; y: number; w: number; h: number } | null, warnings: string[]): Gradient | undefined {
  const stops: GradientStop[] = Array.from(el.getElementsByTagName('stop')).map((s) => {
    const decl = declared(s);
    const raw = decl.offset ?? '0';
    const offset = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
    return { offset: Math.min(1, Math.max(0, Number.isFinite(offset) ? offset : 0)), color: parseColor(decl['stop-color'] ?? '#000000') ?? '#000000' };
  });
  if (stops.length === 0) return undefined;
  const bbox = el.getAttribute('gradientUnits') !== 'userSpaceOnUse';
  const num = (name: string, fallback: number) => {
    const v = el.getAttribute(name);
    if (v == null) return fallback;
    return v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : Number(v);
  };
  if (bbox && !box) {
    warnings.push('gradient on a shape with no box was approximated');
  }
  const toX = (f: number) => (bbox && box ? box.x + f * box.w : f);
  const toY = (f: number) => (bbox && box ? box.y + f * box.h : f);
  if (el.localName === 'linearGradient') {
    return { type: 'linear', x1: toX(num('x1', 0)), y1: toY(num('y1', 0)), x2: toX(num('x2', 1)), y2: toY(num('y2', 0)), stops };
  }
  const cx = toX(num('cx', 0.5));
  const cy = toY(num('cy', 0.5));
  const r = bbox && box ? num('r', 0.5) * Math.max(box.w, box.h) : num('r', 0.5);
  return { type: 'radial', cx, cy, r, fx: toX(num('fx', num('cx', 0.5))), fy: toY(num('fy', num('cy', 0.5))), stops };
}

export function importSvg(text: string): SvgImport {
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = parsed.documentElement;
  if (!root || root.localName !== 'svg' || parsed.getElementsByTagName('parsererror').length) {
    throw new Error('Not an SVG file');
  }
  const warnings: string[] = [];
  const ids = new Map<string, Element>();
  for (const el of Array.from(root.querySelectorAll('[id]'))) ids.set(el.id, el);

  // Size from width/height, or the viewBox; a viewBox that differs from the size scales the drawing.
  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const hasVb = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0;
  const width = parseLength(root.getAttribute('width'), hasVb ? vb[2] : 512);
  const height = parseLength(root.getAttribute('height'), hasVb ? vb[3] : 512);
  const rootMatrix: Matrix | undefined = hasVb
    ? [width / vb[2], 0, 0, height / vb[3], -vb[0] * (width / vb[2]), -vb[1] * (height / vb[3])]
    : undefined;

  /** Style for an element: its own declarations over what it inherits. */
  const styleFor = (el: Element, inh: Inherited): Inherited => {
    const d = declared(el);
    const next: Inherited = { ...inh };
    if (d.fill !== undefined) {
      const c = parseColor(d.fill);
      if (c === 'none') {
        next.fill = 'none';
        next.fillUrl = undefined;
      } else if (c) {
        next.fill = c;
        next.fillUrl = undefined;
      } else if (urlId(d.fill)) {
        next.fillUrl = urlId(d.fill)!;
      } else {
        warnings.push(`fill "${d.fill}" is not supported`);
      }
    }
    if (d.stroke !== undefined) {
      const c = parseColor(d.stroke);
      if (c && c !== 'none') next.color = c;
      else if (c === null && !urlId(d.stroke)) warnings.push(`stroke "${d.stroke}" is not supported`);
      if (c === 'none') next.width = 0;
    }
    if (d['stroke-width'] !== undefined) next.width = parseLength(d['stroke-width'], inh.width);
    if (d['stroke-linecap']) next.cap = d['stroke-linecap'] as Style['cap'];
    if (d['stroke-linejoin']) next.join = d['stroke-linejoin'] as Style['join'];
    if (d['stroke-miterlimit']) next.miterLimit = parseLength(d['stroke-miterlimit'], 10);
    if (d['stroke-dasharray'] !== undefined) next.dash = parseDash(d['stroke-dasharray']);
    const opacity = d.opacity !== undefined ? parseLength(d.opacity, 1) : 1;
    next.opacity = inh.opacity * opacity;
    if (d['fill-opacity'] !== undefined && parseLength(d['fill-opacity'], 1) < 1) warnings.push('fill-opacity is approximated by the item opacity');
    return next;
  };

  const styleOf = (inh: Inherited): Style => {
    const style: Style = { color: inh.color, width: inh.width, opacity: inh.opacity < 1 ? inh.opacity : undefined };
    if (inh.fill !== 'none') style.fill = inh.fill;
    if (inh.cap) style.cap = inh.cap;
    if (inh.join) style.join = inh.join;
    if (inh.miterLimit !== undefined) style.miterLimit = inh.miterLimit;
    if (inh.dash) style.dash = inh.dash;
    return style;
  };

  /**
   * The finished item: its transform, and a gradient fill laid over its own box
   * when the fill refers to a gradient.
   */
  const finish = (item: Item, inh: Inherited, el: Element): Item => {
    let out = item;
    if (inh.fillUrl && 'style' in item) {
      const el2 = ids.get(inh.fillUrl);
      const g = el2 && (el2.localName === 'linearGradient' || el2.localName === 'radialGradient') ? gradientOf(el2, typeOf(item).bounds(item), warnings) : undefined;
      if (g) out = { ...item, style: { ...item.style, fillGradient: g } } as Item;
      else warnings.push(`paint server #${inh.fillUrl} is not supported`);
    }
    const transform = parseTransform(declared(el).transform);
    return transform ? ({ ...out, transform } as Item) : out;
  };

  const walk = (el: Element, inh: Inherited): Item[] => {
    const out: Item[] = [];
    for (const child of Array.from(el.children)) {
      const tag = child.localName;
      if (['defs', 'linearGradient', 'radialGradient', 'style', 'title', 'desc', 'metadata', 'script'].includes(tag)) continue;
      const style = styleFor(child, inh);
      const id = uid('item');
      let item: Item | null = null;
      const num = (name: string) => parseLength(child.getAttribute(name), 0);
      if (tag === 'g' || tag === 'svg') {
        const kids = walk(child, style);
        if (kids.length === 0) continue;
        const group: GroupItem = { kind: 'group', id, items: kids };
        const t = parseTransform(declared(child).transform);
        out.push(t ? { ...group, transform: t } : group);
        continue;
      }
      if (tag === 'path') {
        try {
          const subs: SubPath[] = parsePathData(child.getAttribute('d') ?? '');
          const path: PathItem = { kind: 'path', id, subs, style: styleOf(style) };
          item = finish(path, style, child);
        } catch {
          warnings.push('a path with unreadable data was skipped');
        }
      } else if (tag === 'rect') {
        const rx = child.getAttribute('rx') != null ? num('rx') : num('ry');
        const rect: RectItem = { kind: 'rect', id, x: num('x'), y: num('y'), w: num('width'), h: num('height'), r: rx, style: styleOf(style) };
        item = finish(rect, style, child);
      } else if (tag === 'circle' || tag === 'ellipse') {
        const rx = tag === 'circle' ? num('r') : num('rx');
        const ry = tag === 'circle' ? num('r') : num('ry');
        const e: EllipseItem = { kind: 'ellipse', id, cx: num('cx'), cy: num('cy'), rx, ry, style: styleOf(style) };
        item = finish(e, style, child);
      } else if (tag === 'line') {
        const line: LineItem = { kind: 'line', id, a: { x: num('x1'), y: num('y1') }, b: { x: num('x2'), y: num('y2') }, style: styleOf(style) };
        item = finish(line, style, child);
      } else if (tag === 'polyline' || tag === 'polygon') {
        const nums = (child.getAttribute('points') ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
        const nodes = [];
        for (let i = 0; i + 1 < nums.length; i += 2) nodes.push({ p: { x: nums[i], y: nums[i + 1] } as Pt });
        if (nodes.length >= 2) {
          const path: PathItem = { kind: 'path', id, subs: [{ nodes, closed: tag === 'polygon' }], style: styleOf(style) };
          item = finish(path, style, child);
        }
      } else if (tag === 'text') {
        const t: TextItem = {
          kind: 'text',
          id,
          x: num('x'),
          y: num('y'),
          text: (child.textContent ?? '').trim(),
          font: (declared(child)['font-family'] ?? 'sans-serif').split(',')[0].replace(/['"]/g, '').trim() || 'sans-serif',
          size: parseLength(declared(child)['font-size'] ?? null, 16),
          weight: Number(declared(child)['font-weight']) || 400,
          align: declared(child)['text-anchor'] === 'middle' ? 'center' : declared(child)['text-anchor'] === 'end' ? 'right' : 'left',
          style: { color: style.fill === 'none' ? style.color : style.fill, width: 0, opacity: style.opacity === 1 ? undefined : style.opacity },
        };
        if (t.text) item = finish(t, style, child);
        else continue;
        warnings.push('text is imported as a single block; tspans are merged');
      } else if (tag === 'image') {
        warnings.push('images inside SVG are not imported as vectors and were skipped');
        continue;
      } else {
        warnings.push(`<${tag}> is not supported and was skipped`);
        continue;
      }
      if (item) out.push(item);
    }
    return out;
  };

  const items = walk(root, styleFor(root, { ...DEFAULTS }));
  const top: Item[] = rootMatrix && items.length ? [{ kind: 'group', id: uid('item'), items, transform: rootMatrix } as GroupItem] : items;
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), items: top, warnings: [...new Set(warnings)] };
}

