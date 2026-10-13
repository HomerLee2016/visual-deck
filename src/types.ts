import type { Matrix } from './matrix';

export interface Pt {
  x: number;
  y: number;
}

/** A colour stop along a gradient; `offset` runs from 0 to 1. */
export interface GradientStop {
  offset: number;
  color: string;
}

/** Linear gradient from (x1, y1) to (x2, y2), in the item's own coordinates. */
export interface LinearGradient {
  type: 'linear';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: GradientStop[];
}

/** Radial gradient: stop 0 at the focal point (fx, fy), stop 1 on the circle (cx, cy, r). */
export interface RadialGradient {
  type: 'radial';
  cx: number;
  cy: number;
  r: number;
  fx: number;
  fy: number;
  stops: GradientStop[];
}

export type Gradient = LinearGradient | RadialGradient;

export interface Style {
  color: string;
  width: number;
  /** Interior colour of closed or open outlines. Missing means no fill. */
  fill?: string;
  /** Replaces `fill` when set. */
  fillGradient?: Gradient;
  /** Replaces `color` for the stroke when set. */
  strokeGradient?: Gradient;
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

/** Axis-aligned rectangle; (x, y) is the top-left corner, `r` the corner radius. */
export interface RectItem {
  kind: 'rect';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  style: Style;
  transform?: Matrix;
}

/** Ellipse centred on (cx, cy) with radii rx and ry. */
export interface EllipseItem {
  kind: 'ellipse';
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  style: Style;
  transform?: Matrix;
}

/** Regular polygon: `sides` vertices on a circle of radius `r`, the first at angle `rot` (radians). */
export interface PolygonItem {
  kind: 'polygon';
  id: string;
  cx: number;
  cy: number;
  r: number;
  sides: number;
  rot: number;
  style: Style;
  transform?: Matrix;
}

/** Star with `sides` points: outer vertices at `r`, inner vertices at `r * inner`. */
export interface StarItem {
  kind: 'star';
  id: string;
  cx: number;
  cy: number;
  r: number;
  sides: number;
  inner: number;
  rot: number;
  style: Style;
  transform?: Matrix;
}

/** A path node: its anchor, plus optional handles. A node without handles is a corner. */
export interface PathNode {
  p: Pt;
  /** Incoming control point (on the segment arriving at this node). */
  in?: Pt;
  /** Outgoing control point (on the segment leaving this node). */
  out?: Pt;
}

/** A run of nodes. A closed subpath also draws the segment from its last node back to its first. */
export interface SubPath {
  nodes: PathNode[];
  closed: boolean;
}

/** One item for any outline: lines, curves, freehand strokes and shapes converted to paths. */
export interface PathItem {
  kind: 'path';
  id: string;
  subs: SubPath[];
  style: Style;
  transform?: Matrix;
}

export type ShapeItem = LineItem | ArcItem | CurveItem | BrushItem | RectItem | EllipseItem | PolygonItem | StarItem | PathItem;
/** Text block. (x, y) is the top-left of the first line; lines are separated by `\n`. */
export interface TextItem {
  kind: 'text';
  id: string;
  x: number;
  y: number;
  text: string;
  /** CSS font family, e.g. `sans-serif`. */
  font: string;
  /** Font size in document units. */
  size: number;
  /** CSS font weight, 100 to 900. */
  weight: number;
  align: 'left' | 'center' | 'right';
  /** Colour comes from `style.color`; stroke and fill settings do not apply to text. */
  style: Style;
  transform?: Matrix;
}

/** Items moved, transformed and selected together. Children keep their own transforms, inside the group's. */
export interface GroupItem {
  kind: 'group';
  id: string;
  items: Item[];
  transform?: Matrix;
}

export type Item = ShapeItem | ImageItem | TextItem | GroupItem;
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
