import type { Matrix } from './matrix';

export interface Pt {
  x: number;
  y: number;
}

export interface Style {
  color: string;
  width: number;
  /** Interior colour of closed or open outlines. Missing means no fill. */
  fill?: string;
  /** 0 to 1. Missing means fully opaque. */
  opacity?: number;
  /** Line end shape. Missing means round. */
  cap?: 'butt' | 'round' | 'square';
  /** Corner shape. Missing means round. */
  join?: 'miter' | 'round' | 'bevel';
  /** Miter limit, as in Canvas and SVG. Missing means the default of 10. */
  miterLimit?: number;
  /** Dash lengths in document units, e.g. [6, 4]. Missing or empty means solid. */
  dash?: number[];
}

export interface LineItem {
  kind: 'line';
  id: string;
  a: Pt;
  b: Pt;
  style: Style;
  /** Applied to the item's points (which stay in local space). Missing means identity. */
  transform?: Matrix;
}

/** Circular arc from `a` to `b` passing through `m`. */
export interface ArcItem {
  kind: 'arc';
  id: string;
  a: Pt;
  b: Pt;
  m: Pt;
  style: Style;
  /** Applied to the item's points (which stay in local space). Missing means identity. */
  transform?: Matrix;
}

/** Cubic Bézier from `a` to `b` with control points `c1`, `c2`. */
export interface CurveItem {
  kind: 'curve';
  id: string;
  a: Pt;
  b: Pt;
  c1: Pt;
  c2: Pt;
  style: Style;
  /** Applied to the item's points (which stay in local space). Missing means identity. */
  transform?: Matrix;
}

export interface ImageItem {
  kind: 'image';
  id: string;
  x: number;
  y: number;
  /** Treated as immutable: replace the item instead of drawing into it. */
  canvas: HTMLCanvasElement;
  /** Applied to the item's position (which stays in local space). Missing means identity. */
  transform?: Matrix;
}

/** Freehand stroke through `pts`, recorded while the pointer is held down. */
export interface BrushItem {
  kind: 'brush';
  id: string;
  pts: Pt[];
  style: Style;
  /** Applied to the item's points (which stay in local space). Missing means identity. */
  transform?: Matrix;
}

export type ShapeItem = LineItem | ArcItem | CurveItem | BrushItem;
export type Item = ShapeItem | ImageItem;
export type ShapeKind = ShapeItem['kind'];

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  items: Item[];
}

/**
 * Immutable document snapshot. Never mutate one in place: build a new object
 * instead. That is what makes history snapshots cheap (they share structure).
 */
export interface DocState {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly Layer[];
}

export interface HistoryEntry {
  label: string;
  state: DocState;
  /** Small data-URL preview of the composite at this step. */
  thumb: string | null;
}

export type ItemKind = Item['kind'];
