import type { Rect } from '../math';
import type { Item, Pt, ShapeItem, Style } from '../types';

/**
 * Behaviour of one item kind. Every operation that used to switch on `kind`
 * (drawing, bounds, hit-testing, moving, SVG export) lives here, so adding an
 * item kind means adding one file that implements this interface.
 */
export interface ItemType<T extends Item = Item> {
  /** Paint the item in document space. */
  draw(ctx: CanvasRenderingContext2D, it: T): void;
  /** Axis-aligned box in document space, including stroke width. */
  bounds(it: T): Rect;
  /** `tol` is in document units (screen tolerance divided by zoom). */
  hitTest(it: T, p: Pt, tol: number): boolean;
  translate(it: T, dx: number, dy: number): T;
  /** SVG markup. `env` caches embedded bitmaps and collects shared definitions (gradients). */
  toSvg(it: T, env: SvgEnv): string;
  /** Points drawn as selection handles. */
  handles(it: T): Pt[];
  /** Copy with a new style, or null if the kind has no style. */
  withStyle?(it: T, style: Style): T | null;
}

/** Settings a click-placed shape takes at creation time (from the toolbox). */
export interface ShapeParams {
  /** Rectangle corner radius. */
  radius: number;
  /** Polygon side count. */
  sides: number;
  /** Star inner radius as a fraction of the outer radius. */
  inner: number;
}

export const DEFAULT_SHAPE_PARAMS: ShapeParams = { radius: 0, sides: 6, inner: 0.5 };

/** Per-export state shared by every item's SVG: embedded bitmaps (encoded once) and <defs> keyed by content. */
export interface SvgEnv {
  hrefs: Map<HTMLCanvasElement, string>;
  defs: Map<string, { id: string; markup: string }>;
}

/** Click-to-place parameters for a shape tool. */
export interface ClickSpec {
  /** Name used in history steps, e.g. "Arc". */
  label: string;
  /** Points needed before the shape is complete. */
  needed: number;
  /** Status-bar prompt for the next point, given how many are placed (at least 2). */
  hint(placed: number): string;
  /** Build from the points so far; may degrade to a simpler shape while points are missing. */
  build(pts: Pt[], style: Style, id: string, params: ShapeParams): ShapeItem | null;
  /** While Shift is held, the second point is moved to `constrained(anchor, p)` (e.g. a square corner). */
  constrain?(anchor: Pt, p: Pt): Pt;
}

/** A vector shape: a polyline outline plus a path that can be stroked. */
export interface ShapeType<T extends ShapeItem = ShapeItem> extends ItemType<T> {
  /** Polyline approximation used for hit-testing and bounds. */
  outline(it: T): Pt[];
  /** Add the outline to the current canvas path (no stroke). */
  trace(ctx: CanvasRenderingContext2D, it: T): void;
  /** SVG path data (`d` attribute). */
  pathData(it: T): string;
  /** Present only for shapes that are placed by clicking. */
  clicks?: ClickSpec;
}
