import type { Rect } from './math';
import { multiply, translation, type Matrix } from './matrix';
import type { Pt } from './types';

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot';

export interface Handle extends Pt {
  id: HandleId;
}

/** Distance (screen pixels) from the top edge to the rotate handle. */
export const ROTATE_OFFSET_PX = 24;

/** The eight scale handles and the rotate handle around a box. `zoom` keeps the rotate knob a fixed screen distance away. */
export function handlesFor(box: Rect, zoom: number): Handle[] {
  const x0 = box.x;
  const x1 = box.x + box.w;
  const xm = box.x + box.w / 2;
  const y0 = box.y;
  const y1 = box.y + box.h;
  const ym = box.y + box.h / 2;
  return [
    { id: 'nw', x: x0, y: y0 },
    { id: 'n', x: xm, y: y0 },
    { id: 'ne', x: x1, y: y0 },
    { id: 'e', x: x1, y: ym },
    { id: 'se', x: x1, y: y1 },
    { id: 's', x: xm, y: y1 },
    { id: 'sw', x: x0, y: y1 },
    { id: 'w', x: x0, y: ym },
    { id: 'rot', x: xm, y: y0 - ROTATE_OFFSET_PX / zoom },
  ];
}

/** The handle under `p`, if any. `tol` is in document units. */
export function hitHandle(handles: Handle[], p: Pt, tol: number): HandleId | null {
  for (const h of handles) {
    if (Math.abs(p.x - h.x) <= tol && Math.abs(p.y - h.y) <= tol) return h.id;
  }
  return null;
}

/** Scale matrix for dragging a handle of `box` to `p`. The opposite side or corner stays fixed. */
export function scaleMatrix(box: Rect, id: HandleId, p: Pt, keepAspect = false): Matrix {
  const movesX = id.includes('e') || id.includes('w');
  const movesY = id.includes('n') || id.includes('s');
  const anchorX = id.includes('w') ? box.x + box.w : id.includes('e') ? box.x : box.x + box.w / 2;
  const anchorY = id.includes('n') ? box.y + box.h : id.includes('s') ? box.y : box.y + box.h / 2;
  const origX = id.includes('w') ? box.x : box.x + box.w;
  const origY = id.includes('n') ? box.y : box.y + box.h;
  let sx = movesX && origX !== anchorX ? (p.x - anchorX) / (origX - anchorX) : 1;
  let sy = movesY && origY !== anchorY ? (p.y - anchorY) / (origY - anchorY) : 1;
  if (keepAspect && movesX && movesY) {
    // Corner with Shift: both axes take the larger factor, so the proportions hold.
    const m = Math.max(Math.abs(sx), Math.abs(sy));
    sx = Math.sign(sx || 1) * m;
    sy = Math.sign(sy || 1) * m;
  }
  // Never collapse to zero: a flat transform cannot be hit-tested or inverted.
  sx = Math.sign(sx || 1) * Math.max(Math.abs(sx), 0.01);
  sy = Math.sign(sy || 1) * Math.max(Math.abs(sy), 0.01);
  return multiply(translation(anchorX, anchorY), multiply([sx, 0, 0, sy, 0, 0], translation(-anchorX, -anchorY)));
}

/** Rotation by `angle` (radians) about `center`. */
export function rotateMatrix(center: Pt, angle: number): Matrix {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return multiply(translation(center.x, center.y), multiply([c, s, -s, c, 0, 0], translation(-center.x, -center.y)));
}

/** Direction from `center` to `p`, in radians. */
export const angleAt = (center: Pt, p: Pt) => Math.atan2(p.y - center.y, p.x - center.x);

/** The centre of a box. */
export const centerOf = (box: Rect): Pt => ({ x: box.x + box.w / 2, y: box.y + box.h / 2 });

/** Rotation the handle position implies, applied to the item's current transform. */
export function angleOfMatrix(m: Matrix | undefined): number {
  return m ? Math.atan2(m[1], m[0]) : 0;
}
