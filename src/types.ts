export interface Pt {
  x: number;
  y: number;
}

export interface Style {
  color: string;
  width: number;
}

export interface LineItem {
  kind: 'line';
  id: string;
  a: Pt;
  b: Pt;
  style: Style;
}

/** Circular arc from `a` to `b` passing through `m`. */
export interface ArcItem {
  kind: 'arc';
  id: string;
  a: Pt;
  b: Pt;
  m: Pt;
  style: Style;
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
}

export interface ImageItem {
  kind: 'image';
  id: string;
  x: number;
  y: number;
  /** Treated as immutable: replace the item instead of drawing into it. */
  canvas: HTMLCanvasElement;
}

/** Freehand stroke through `pts`, recorded while the pointer is held down. */
export interface BrushItem {
  kind: 'brush';
  id: string;
  pts: Pt[];
  style: Style;
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
