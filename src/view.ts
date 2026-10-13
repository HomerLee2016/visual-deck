import type { Pt } from './types';

/** How the document is placed on the canvas, in CSS pixels. `fitted` is false until the first fit. */
export interface View {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly fitted: boolean;
}

export interface Size {
  w: number;
  h: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 64;
/** Fitting never zooms in past this, so small documents are not blown up. */
const MAX_FIT_ZOOM = 4;
const FIT_MARGIN_PX = 48;

export const INITIAL_VIEW: View = { zoom: 1, panX: 0, panY: 0, fitted: false };

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Center the whole document in the canvas, with a margin. */
export function fitView(canvas: Size, doc: Size): View {
  const room = Math.min((canvas.w - FIT_MARGIN_PX) / doc.w, (canvas.h - FIT_MARGIN_PX) / doc.h);
  const zoom = Math.min(MAX_FIT_ZOOM, Math.max(MIN_ZOOM, room));
  return { zoom, panX: (canvas.w - doc.w * zoom) / 2, panY: (canvas.h - doc.h * zoom) / 2, fitted: true };
}

/** Change the zoom while keeping the document point under screen point `around` fixed. */
export function zoomAround(view: View, zoom: number, around: Pt): View {
  const z = clampZoom(zoom);
  return {
    ...view,
    zoom: z,
    panX: around.x - ((around.x - view.panX) / view.zoom) * z,
    panY: around.y - ((around.y - view.panY) / view.zoom) * z,
  };
}

export function toDoc(view: View, screen: Pt): Pt {
  return { x: (screen.x - view.panX) / view.zoom, y: (screen.y - view.panY) / view.zoom };
}

export function toScreen(view: View, doc: Pt): Pt {
  return { x: doc.x * view.zoom + view.panX, y: doc.y * view.zoom + view.panY };
}
