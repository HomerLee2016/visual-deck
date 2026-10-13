import { arcType } from './arc';
import { brushType } from './brush';
import { curveType } from './curve';
import { ellipseType } from './ellipse';
import { pathType } from './path';
import { polygonType } from './polygon';
import { starType } from './star';
import { textType } from './text';
import { imageType } from './image';
import { groupType } from './group';
import { lineType } from './line';
import { rectType } from './rect';
import type { ItemType, ShapeType, SvgEnv } from './types';
import { clipRef } from './defs';
import type { GroupItem, Item, ItemKind, ShapeItem, ShapeKind } from '../types';
import { transformAttr } from './shape';

/**
 * The behaviour of every item kind. Typed as a full map, so adding a kind to
 * `ItemKind` without registering it here is a compile error.
 */
const types: { [K in ItemKind]: ItemType<Extract<Item, { kind: K }>> } = {
  line: lineType,
  arc: arcType,
  curve: curveType,
  brush: brushType,
  image: imageType,
  rect: rectType,
  ellipse: ellipseType,
  polygon: polygonType,
  star: starType,
  text: textType,
  group: groupType,
  path: pathType,
};

/** Paint an item, applying its transform and any clip or mask. */
export function drawItem(ctx: CanvasRenderingContext2D, it: Item): void {
  if (!it.transform && !it.clip) {
    typeOf(it).draw(ctx, it);
    return;
  }
  ctx.save();
  if (it.transform) ctx.transform(...it.transform);
  if (!it.clip) typeOf(it).draw(ctx, it);
  else if (it.clip.mode === 'clip') drawClipped(ctx, it);
  else drawMasked(ctx, it);
  ctx.restore();
}

/** Trace a clipping shape's outline in the current coordinates (its own transform applies first). */
function traceClipShape(ctx: CanvasRenderingContext2D, shape: ShapeItem): void {
  ctx.save();
  if (shape.transform) ctx.transform(...shape.transform);
  ctx.beginPath();
  shapeTypeOf(shape).trace(ctx, shape);
  ctx.restore();
}

/** Only the part of the item inside the clipping shape is painted. */
function drawClipped(ctx: CanvasRenderingContext2D, it: Item): void {
  ctx.save();
  traceClipShape(ctx, it.clip!.shape);
  ctx.clip();
  typeOf(it).draw(ctx, it);
  ctx.restore();
}

/**
 * The item is kept where the masking shape is opaque. The item and the mask are
 * drawn on an offscreen layer covering the item's device-space box, then copied back.
 */
function drawMasked(ctx: CanvasRenderingContext2D, it: Item): void {
  const m = ctx.getTransform();
  const local = typeOf(it).bounds(it);
  const corners = [
    { x: local.x, y: local.y },
    { x: local.x + local.w, y: local.y },
    { x: local.x + local.w, y: local.y + local.h },
    { x: local.x, y: local.y + local.h },
  ].map((p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }));
  const x0 = Math.floor(Math.min(...corners.map((p) => p.x)));
  const y0 = Math.floor(Math.min(...corners.map((p) => p.y)));
  const x1 = Math.ceil(Math.max(...corners.map((p) => p.x)));
  const y1 = Math.ceil(Math.max(...corners.map((p) => p.y)));
  const off = document.createElement('canvas');
  off.width = Math.max(1, x1 - x0);
  off.height = Math.max(1, y1 - y0);
  const oc = off.getContext('2d')!;
  oc.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
  typeOf(it).draw(oc, it);
  oc.globalCompositeOperation = 'destination-in';
  traceClipShape(oc, it.clip!.shape);
  oc.fillStyle = '#000';
  oc.fill();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(off, x0, y0);
  ctx.restore();
}

/** Behaviour for an item's kind. */
export function typeOf(it: Item): ItemType {
  return lookup(it.kind) as ItemType;
}

/** Behaviour for a vector shape, which additionally exposes its outline and path. */
export function shapeTypeOf(it: ShapeItem | ShapeKind): ShapeType {
  return lookup(typeof it === 'string' ? it : it.kind) as ShapeType;
}

function lookup(kind: ItemKind): ItemType {
  return types[kind] as ItemType;
}

/** An instance is written as a reference to its symbol, which is defined once in <defs>. */
function useOf(it: GroupItem, env: SvgEnv): string {
  const id = `symbol-${it.symbolId}`;
  if (!env.defs.has(`symbol:${id}`)) {
    const content = env.symbols[it.symbolId!].map((c) => svgOf(c, env)).join('');
    env.defs.set(`symbol:${id}`, { id, markup: `<symbol id="${id}">${content}</symbol>` });
  }
  return `<use href="#${id}"${transformAttr(it.transform)}/>`;
}

/** An item's SVG markup, wrapped in a group that applies its clip or mask. */
export function svgOf(it: Item, env: SvgEnv): string {
  const isInstance = it.kind === 'group' && !!it.symbolId && !!env.symbols[it.symbolId];
  const inner = isInstance ? useOf(it as GroupItem, env) : typeOf(it).toSvg(it, env);
  if (!it.clip) return inner;
  const ref = clipRef(it.clip, env);
  return it.clip.mode === 'clip' ? `<g clip-path="${ref}">${inner}</g>` : `<g mask="${ref}">${inner}</g>`;
}
