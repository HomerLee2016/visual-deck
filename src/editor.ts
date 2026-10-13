import {
  buildShape,
  clickSpec,
  dist,
  hitTest,
  itemBounds,
  rectFromPoints,
  rectsIntersect,
  transformItem,
  translateItem,
  type ClickShapeKind,
} from './geometry';
import { typeOf } from './items/registry';
import { DEFAULT_TEXT_STYLE, type TextStyle } from './items/text';
import { angleAt, centerOf, handlesFor, hitHandle, rotateMatrix, scaleMatrix, type HandleId } from './handles';
import type { Rect } from './math';
import { groupItems, ungroupItems, unionBox } from './arrange';
import { RULER_PX, drawScene, renderToCanvas } from './render';
import { DEFAULT_EDGE_OPTIONS, cleanEdge, type EdgeOptions } from './fringe';
import { emptyMask, paintDisc, paintStroke, storedMask, wholeCanvas, type Mask } from './mask';
import { snapBox } from './snap';
import { DEFAULT_SHAPE_PARAMS, type ShapeParams } from './items/types';
import { DEFAULT_STYLE, Workspace, imageItem, layerOfItem, mapItems, removeItems, sameLayerItemIds, uid, visibleItemsTopFirst } from './model';
import type { DocState, GradientStop, Item, PathItem, PathNode, Pt, ShapeItem, ShapeKind, Style, TextItem } from './types';
import { deleteNodes, insertNode, moveHandle, moveNodes, nearestNodeHit, nearestSegment, nodeKey, setSmooth } from './nodes';
import { defaultGradient, gradientHandles, moveGradientHandle, type GradientHandle } from './gradient';
import { IDENTITY, apply as applyM, invert as invertM } from './matrix';
import { fitView, toDoc, zoomAround, type Size } from './view';

export type ToolId = 'select' | Exclude<ShapeKind, 'path'> | 'text' | 'pen' | 'node' | 'edge';

/** What the Select tool picks: whole items, every item on a layer, or brush-stroke points. */
export type SelectMode = 'object' | 'layer' | 'points';

export const TOOL_KEYS: Record<string, ToolId> = { v: 'select', l: 'line', a: 'arc', c: 'curve', b: 'brush', r: 'rect', e: 'ellipse', g: 'polygon', s: 'star', t: 'text', p: 'pen', n: 'node', f: 'edge' };

interface Draft {
  kind: ClickShapeKind;
  pts: Pt[];
  hover: Pt;
  /** True between pointerdown and pointerup of the first point (allows press-drag-release for start->end). */
  pressing: boolean;
  downScreen: Pt;
}

type Drag =
  | { mode: 'move'; origin: Pt; base: DocState; moved: boolean; box: Rect | null }
  | { mode: 'guide'; axis: 'x' | 'y'; pos: number }
  | { mode: 'nodes'; id: string; origin: Pt; base: DocState; moved: boolean }
  | { mode: 'gradient'; id: string; which: GradientHandle; base: DocState; moved: boolean; transform?: Item['transform'] }
  | { mode: 'handle'; id: string; s: number; n: number; which: 'in' | 'out'; base: DocState; moved: boolean }
  | { mode: 'scale'; handle: HandleId; box: Rect; ids: Set<string>; base: DocState; moved: boolean }
  | { mode: 'rotate'; center: Pt; start: number; ids: Set<string>; base: DocState; moved: boolean }
  | { mode: 'marquee'; origin: Pt; cur: Pt; additive: boolean; baseSel: Set<string> }
  | { mode: 'brush'; pts: Pt[] }
  | { mode: 'edge'; last: Pt }
  | { mode: 'mask'; last: Pt };

/** History label for each drag that edits the document in place and commits when released. */
const COMMIT_LABELS = { move: 'Move', nodes: 'Move nodes', gradient: 'Move gradient', handle: 'Move handle', scale: 'Scale', rotate: 'Rotate' } as const;

const PICK_TOLERANCE_PX = 6;
/** How close (screen pixels) the pointer must be to a selection handle to grab it. */
const HANDLE_TOLERANCE_PX = 6;
/** How close (screen pixels) a moved edge must be to a grid line or guide to snap to it. */
const SNAP_PX = 6;
/** Minimum screen distance between recorded brush points; denser samples add nothing visible. */
const BRUSH_SPACING_PX = 2;
/** An Edge session: the layer being cleaned, its pixels, and the brushed mask (1 = may change). */
interface EdgeSession {
  layerId: string;
  work: HTMLCanvasElement;
  mask: Uint8Array;
  /** Red tint of the brushed area, drawn over the layer while painting. */
  overlay: HTMLCanvasElement;
}

const EDGE_TINT = 'rgba(255, 70, 70, 0.45)';
/** Colour and opacity of the script-mask highlight. */
const MASK_TINT = { r: 255, g: 215, b: 0, a: 120 };

/** The Modify mask session: the selection being painted, the brush, and the highlight drawn over it. */
interface MaskEdit {
  draft: Uint8Array;
  overlay: HTMLCanvasElement;
}
const HIDDEN_LAYER_MSG = 'The active layer is hidden – show it or pick another layer first.';

/** Where text is being typed: a new block at `at`, or an existing item being re-edited. */
export interface TextRequest {
  ws: Workspace;
  at: Pt;
  /** Canvas-relative pixel position, used to place the input over the canvas. */
  screen: Pt;
  zoom: number;
  item?: TextItem;
}

/** A path being drawn with the pen: the nodes placed so far, and the pointer hovering after the last one. */
interface PenDraft {
  nodes: PathNode[];
  hover: Pt;
  /** True between pointerdown and pointerup of the node being placed; dragging bends it into a smooth node. */
  dragging: boolean;
  downScreen: Pt;
}

/** Clicking within this many screen pixels of the first node closes the path. */
const PEN_CLOSE_PX = 8;
/** Movement (screen pixels) before a pen press counts as a drag rather than a click. */
const PEN_DRAG_PX = 3;

/** The item's paint style, or undefined for kinds without one (images, groups). */
const styleOf = (it: Item) => ('style' in it ? it.style : undefined);

/** The item with its style replaced by `fn(style)`, or unchanged if its kind has no style. */
function restyle(it: Item, fn: (style: Style) => Style): Item {
  const style = styleOf(it);
  return style ? (typeOf(it).withStyle?.(it, fn(style)) ?? it) : it;
}

/** Owns the main canvas: view transform, tools and all pointer/keyboard input for the active workspace. */
export class Editor {
  tool: ToolId = 'select';
  selectMode: SelectMode = 'object';
  style: Style = { ...DEFAULT_STYLE };
  /** Creation-time settings for click-placed shapes (corner radius, polygon sides, star depth). */
  params: ShapeParams = { ...DEFAULT_SHAPE_PARAMS };
  /** Path being drawn with the pen tool, if any. */
  private pen: PenDraft | null = null;
  /** The Edge tool's pending cleanup, if the brush has been used and not yet applied or cancelled. */
  private edge: EdgeSession | null = null;
  private edgeOpts: EdgeOptions = { ...DEFAULT_EDGE_OPTIONS };
  /** Edge tool brush radius, in document pixels. */
  private edgeRadius = 6;
  /** The Modify mask session, if one is open. */
  private maskEdit: MaskEdit | null = null;
  /** Mask brush: add to or remove from the selection, radius in document pixels. */
  private maskBrush: { op: 'add' | 'remove'; radius: number } = { op: 'add', radius: 6 };
  /** Whether the script mask is highlighted on the canvas (outside a Modify mask session). */
  maskVisible = false;
  private maskCache: { mask: Mask; canvas: HTMLCanvasElement } | null = null;
  private wholeMask: Mask | null = null;
  /** Nodes selected in the node tool, as "subpath.node" keys of the path in `nodeItemId`. */
  private nodeSel = new Set<string>();
  private nodeItemId: string | null = null;
  /** Font settings for new text and the text tool's defaults. */
  textStyle: TextStyle = { ...DEFAULT_TEXT_STYLE };
  clipboard: Item[] = [];
  ws!: Workspace;
  /** Called when tool/selection state changes so the toolbox can refresh. */
  onUiChange: () => void = () => {};
  onStatus: (msg: string) => void = () => {};
  /** Called when text should be typed in (new block, or re-editing with a double-click). */
  onText: (req: TextRequest) => void = () => {};
  /** Called with a pasted/dropped image file. */
  onImageFile: (file: File) => void = () => {};

  private ctx: CanvasRenderingContext2D;
  private draft: Draft | null = null;
  private drag: Drag | null = null;
  /** Last document point under the pointer; null when it has left the canvas. */
  private hover: Pt | null = null;
  private pan: { sx: number; sy: number; px: number; py: number } | null = null;
  private spaceDown = false;
  private pasteCount = 0;
  private raf = 0;
  private dpr = 1;
  /** False until the ResizeObserver has measured the canvas (fitting earlier would use a bogus size). */
  private sized = false;
  private unsub: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', () => this.cancelInteraction());
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.requestRender();
    });
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceDown = false;
    });
    document.addEventListener('paste', (e) => this.onPaste(e));
  }

  // ---- workspace / tool plumbing -------------------------------------------

  setWorkspace(ws: Workspace): void {
    this.unsub?.();
    this.cancelInteraction();
    this.cancelEdge();
    this.cancelMaskEdit();
    this.ws = ws;
    this.unsub = ws.subscribe(() => this.requestRender());
    this.pasteCount = 0;
    this.requestRender();
    this.onUiChange();
  }

  setTool(t: ToolId): void {
    this.finishPen(false);
    if (t !== 'edge') this.cancelEdge();
    this.cancelMaskEdit();
    this.nodeSel.clear();
    this.cancelInteraction();
    this.tool = t;
    this.canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    this.onUiChange();
  }

  setSelectMode(mode: SelectMode): void {
    this.cancelInteraction();
    this.selectMode = mode;
    this.onUiChange();
  }

  setParams(patch: Partial<ShapeParams>): void {
    this.params = { ...this.params, ...patch };
  }

  /**
   * Set the fill to a solid colour, or to a linear or radial gradient. Gradients
   * are laid out over each selected item's own box.
   */
  setFillPaint(kind: 'solid' | 'linear' | 'radial'): void {
    const stops: GradientStop[] = this.style.fillGradient?.stops ?? [
      { offset: 0, color: this.style.fill ?? '#ffffff' },
      { offset: 1, color: '#000000' },
    ];
    this.style = { ...this.style, fillGradient: kind === 'solid' ? undefined : defaultGradient(kind, { x: 0, y: 0, w: 1, h: 1 }, stops) };
    const ids = new Set(this.ws.selectedItems(true).map((it) => it.id));
    if (ids.size === 0) return;
    this.ws.edit('Fill paint', (s) =>
      mapItems(s, ids, (it) =>
        restyle(it, (style) => ({ ...style, fillGradient: kind === 'solid' ? undefined : defaultGradient(kind, typeOf(it).bounds(it), stops) })),
      ),
    );
  }

  /** Replace the stops of the fill gradient (the editor's default and the selected items' gradients). */
  setFillStops(stops: GradientStop[], applyToSelection = false): void {
    if (!this.style.fillGradient) return;
    this.style = { ...this.style, fillGradient: { ...this.style.fillGradient, stops } };
    if (!applyToSelection) return;
    const ids = new Set(this.ws.selectedItems(true).filter((it) => styleOf(it)?.fillGradient).map((it) => it.id));
    if (ids.size === 0) return;
    this.ws.edit('Gradient stops', (s) =>
      mapItems(s, ids, (it) => restyle(it, (style) => (style.fillGradient ? { ...style, fillGradient: { ...style.fillGradient, stops } } : style))),
    );
  }

  /** Change the font settings; also restyles selected text when `applyToSelection`. */
  setTextStyle(patch: Partial<TextStyle>, applyToSelection = false): void {
    this.textStyle = { ...this.textStyle, ...patch };
    if (applyToSelection && this.ws.selectedItems().some((it) => it.kind === 'text')) {
      const ids = this.ws.selection;
      this.ws.edit('Change text style', (s) =>
        mapItems(s, ids, (it) => (it.kind === 'text' ? { ...it, ...patch } : it)),
      );
    }
  }

  /**
   * Change the drawing style; also restyles selected shapes when `applyToSelection`.
   * Only the keys in `patch` change on each selected item, so a traced region's
   * fill does not pick up the drawing style's stroke.
   */
  setStyle(patch: Partial<Style>, applyToSelection = false): void {
    this.style = { ...this.style, ...patch };
    if (applyToSelection) {
      const ids = this.ws.selection;
      const hasStyled = this.ws.selectedItems().some((it) => typeOf(it).withStyle);
      if (hasStyled) {
        this.ws.edit('Change style', (s) =>
          mapItems(s, ids, (it) => typeOf(it).withStyle?.(it, { ...(it as ShapeItem).style, ...patch }) ?? it),
        );
      }
    }
  }

  /** True if new content can go on the active layer; otherwise tells the user why not. */
  private activeLayerVisible(): boolean {
    if (this.ws.activeLayer.visible) return true;
    this.onStatus(HIDDEN_LAYER_MSG);
    return false;
  }

  private cancelInteraction(): void {
    if (this.drag && 'base' in this.drag && this.drag.moved) this.ws.state = this.drag.base;
    this.draft = null;
    this.drag = null;
    this.pan = null;
    this.requestRender();
  }

  // ---- view ---------------------------------------------------------------

  private resize(): void {
    const p = this.canvas.parentElement!;
    this.dpr = window.devicePixelRatio || 1;
    this.sized = true;
    this.canvas.width = Math.max(1, Math.round(p.clientWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(p.clientHeight * this.dpr));
    this.canvas.style.width = `${p.clientWidth}px`;
    this.canvas.style.height = `${p.clientHeight}px`;
    if (this.ws && !this.ws.view.fitted) this.fit();
    // Draw now, not on the next frame: setting canvas.width just cleared it, and a deferred draw
    // lets the browser paint a blank canvas while a sidebar is being dragged.
    this.render();
  }

  /** Canvas size in CSS pixels. */
  private canvasSize(): Size {
    return { w: this.canvas.width / this.dpr, h: this.canvas.height / this.dpr };
  }

  fit(): void {
    if (!this.ws) return;
    const { width, height } = this.ws.state;
    this.ws.view = fitView(this.canvasSize(), { w: width, h: height });
    this.requestRender();
  }

  zoomTo(zoom: number, around?: Pt): void {
    const { w, h } = this.canvasSize();
    this.ws.view = zoomAround(this.ws.view, zoom, around ?? { x: w / 2, y: h / 2 });
    this.requestRender();
  }

  private screenPos(e: { clientX: number; clientY: number }): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomTo(this.ws.view.zoom * Math.pow(1.0015, -e.deltaY), this.screenPos(e));
  }

  // ---- pointer input ------------------------------------------------------

  private pick(p: Pt): Item | null {
    const tol = PICK_TOLERANCE_PX / this.ws.view.zoom;
    for (const it of visibleItemsTopFirst(this.ws.state)) if (hitTest(it, p, tol)) return it;
    return null;
  }

  private onPointerDown(e: PointerEvent): void {
    const s = this.screenPos(e);
    // Canvas drags must not select page text. Moving focus off the page also commits any open text entry (it commits on blur).
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    // Rulers start a guide drag. The top ruler makes a horizontal guide, the left one a vertical guide.
    if (e.button === 0 && !this.spaceDown && this.ws && (s.y < RULER_PX) !== (s.x < RULER_PX)) {
      this.canvas.setPointerCapture(e.pointerId);
      const axis = s.y < RULER_PX ? 'y' : 'x';
      this.drag = { mode: 'guide', axis, pos: toDoc(this.ws.view, s)[axis] };
      this.requestRender();
      return;
    }
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.pan = { sx: s.x, sy: s.y, px: this.ws.view.panX, py: this.ws.view.panY };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    let p = toDoc(this.ws.view, s);
    if (this.maskEdit) {
      this.maskDown(p);
      return;
    }
    if (this.tool === 'select' && (this.gradientHandleDown(p) || this.handleDown(p))) return;
    // New points (shapes and text) snap; freehand brush points and selection do not.
    if (this.tool !== 'select' && this.tool !== 'brush' && this.tool !== 'edge') p = this.snapPt(p);
    if (this.tool === 'select') this.selectDown(p, e.shiftKey);
    else if (this.tool === 'brush') this.brushDown(p);
    else if (this.tool === 'edge') this.edgeDown(p);
    else if (this.tool === 'text') this.textDown(p, s);
    else if (this.tool === 'pen') this.penDown(p, s);
    else if (this.tool === 'node') this.nodeDown(p, e.shiftKey);
    else this.drawDown(this.tool, p, s, e.shiftKey);
  }

  /** A point handle of a selected brush stroke under `p`, if any. */
  private pickPoint(p: Pt): { id: string; index: number } | null {
    const tol = PICK_TOLERANCE_PX / this.ws.view.zoom;
    for (const it of this.ws.selectedItems(true)) {
      if (it.kind !== 'brush') continue;
      const index = it.pts.findIndex((q) => dist(p, q) <= tol);
      if (index >= 0) return { id: it.id, index };
    }
    return null;
  }

  /** Click selects one point of a brush stroke; Shift toggles it and keeps other selections. */
  private selectPoint(id: string, index: number, shift: boolean): void {
    const ws = this.ws;
    if (!shift) {
      ws.selection = new Set([id]);
      ws.pointSelection.clear();
    }
    ws.selection.add(id);
    const picked = new Set(ws.pointSelection.get(id));
    if (picked.has(index)) picked.delete(index);
    else picked.add(index);
    if (picked.size) ws.pointSelection.set(id, picked);
    else ws.pointSelection.delete(id);
    this.afterSelectionChange();
  }

  /** The box around the visible selection, in document space. */
  selectionBox(): Rect | null {
    const items = this.ws.selectedItems(true);
    if (items.length === 0) return null;
    return unionBox(items.map(itemBounds));
  }

  /** Grabs a gradient handle of a selected item's fill, if the pointer is on one. */
  private gradientHandleDown(p: Pt): boolean {
    const tol = HANDLE_TOLERANCE_PX / this.ws.view.zoom;
    for (const it of this.ws.selectedItems(true)) {
      const g = styleOf(it)?.fillGradient;
      if (!g) continue;
      const m = it.transform ?? IDENTITY;
      for (const h of gradientHandles(g)) {
        const q = applyM(m, h.p);
        if (dist(q, p) <= tol) {
          this.drag = { mode: 'gradient', id: it.id, which: h.id, base: this.ws.state, moved: false, transform: it.transform };
          return true;
        }
      }
    }
    return false;
  }

  /** Starts a scale or rotate drag if the pointer is on one of the selection's handles. */
  private handleDown(p: Pt): boolean {
    const box = this.selectionBox();
    if (!box) return false;
    const id = hitHandle(handlesFor(box, this.ws.view.zoom), p, HANDLE_TOLERANCE_PX / this.ws.view.zoom);
    if (!id) return false;
    const ids = new Set(this.ws.selectedItems(true).map((it) => it.id));
    const base = this.ws.state;
    if (id === 'rot') {
      const center = centerOf(box);
      this.drag = { mode: 'rotate', center, start: angleAt(center, p), ids, base, moved: false };
    } else {
      this.drag = { mode: 'scale', handle: id, box, ids, base, moved: false };
    }
    return true;
  }

  /** Document-space handle pairs of the selected gradients, for drawing: a line for linear, centre to rim for radial. */
  private gradientLines(): { a: Pt; b: Pt }[] {
    const out: { a: Pt; b: Pt }[] = [];
    for (const it of this.ws.selectedItems(true)) {
      const g = styleOf(it)?.fillGradient;
      if (!g) continue;
      const m = it.transform ?? IDENTITY;
      const [h0, h1] = gradientHandles(g);
      out.push({ a: applyM(m, h0.p), b: applyM(m, h1.p) });
    }
    return out;
  }

  /** Double-clicking a text item re-opens it for editing. */
  private onDoubleClick(e: MouseEvent): void {
    if (this.tool === 'node') {
      // Double-clicking a segment of the edited path adds a node on it.
      const item = this.nodeTarget();
      const p = toDoc(this.ws.view, this.screenPos(e));
      const near = item ? nearestSegment(item, p) : null;
      if (item && near && near.dist * this.ws.view.zoom <= PICK_TOLERANCE_PX) {
        this.ws.edit('Add node', (s) => mapItems(s, new Set([item.id]), (it) => insertNode(it as PathItem, near.s, near.seg, near.t)));
      }
      return;
    }
    if (this.tool !== 'select') return;
    const screen = this.screenPos(e);
    const hit = this.pick(toDoc(this.ws.view, screen));
    if (hit?.kind === 'text') this.onText({ ws: this.ws, at: { x: hit.x, y: hit.y }, screen, zoom: this.ws.view.zoom, item: hit });
  }

  private selectDown(p: Pt, shift: boolean): void {
    if (this.selectMode === 'points') this.selectPointsDown(p, shift);
    else if (this.selectMode === 'layer') this.selectLayerDown(p, shift);
    else this.selectObjectDown(p, shift);
  }

  /** Points mode: click picks one point on any visible brush stroke. Empty space clears the selection. */
  private selectPointsDown(p: Pt, shift: boolean): void {
    const tol = PICK_TOLERANCE_PX / this.ws.view.zoom;
    for (const it of visibleItemsTopFirst(this.ws.state)) {
      if (it.kind !== 'brush') continue;
      const index = it.pts.findIndex((q) => dist(p, q) <= tol);
      if (index >= 0) {
        this.selectPoint(it.id, index, shift);
        return;
      }
    }
    if (!shift) {
      this.ws.selection.clear();
      this.ws.pointSelection.clear();
    }
    this.afterSelectionChange();
  }

  /** Layer mode: click selects every item on the clicked item's layer and makes that layer active. */
  private selectLayerDown(p: Pt, shift: boolean): void {
    const sel = this.ws.selection;
    this.ws.pointSelection.clear();
    const hit = this.pick(p);
    const layer = hit && layerOfItem(this.ws.state, hit.id);
    if (layer) {
      this.ws.activeLayerId = layer.id;
      const ids = sameLayerItemIds(this.ws.state, [hit.id]);
      // Shift-click on a layer that is fully selected deselects it.
      if (shift && [...ids].every((id) => sel.has(id))) {
        for (const id of ids) sel.delete(id);
      } else {
        if (!shift) sel.clear();
        for (const id of ids) sel.add(id);
        this.drag = { mode: 'move', origin: p, base: this.ws.state, moved: false, box: this.selectionBox() };
      }
    } else {
      if (!shift) sel.clear();
      this.drag = { mode: 'marquee', origin: p, cur: p, additive: shift, baseSel: new Set(sel) };
    }
    this.afterSelectionChange();
  }

  private selectObjectDown(p: Pt, shift: boolean): void {
    const point = this.pickPoint(p);
    if (point) {
      this.selectPoint(point.id, point.index, shift);
      return;
    }
    const sel = this.ws.selection;
    this.ws.pointSelection.clear();
    const hit = this.pick(p);
    if (hit) {
      if (shift && sel.has(hit.id)) {
        sel.delete(hit.id);
        this.afterSelectionChange();
        return;
      }
      if (!sel.has(hit.id)) {
        if (!shift) sel.clear();
        sel.add(hit.id);
      }
      this.drag = { mode: 'move', origin: p, base: this.ws.state, moved: false, box: this.selectionBox() };
    } else {
      if (!shift) sel.clear();
      this.drag = { mode: 'marquee', origin: p, cur: p, additive: shift, baseSel: new Set(sel) };
    }
    this.afterSelectionChange();
  }

  /** The single selected path, which the node tool edits. */
  nodeTarget(): PathItem | null {
    const paths = this.ws.selectedItems(true).filter((it): it is PathItem => it.kind === 'path');
    return paths.length === 1 ? paths[0] : null;
  }

  /** Node tool press: a handle drags that handle, a node is selected and dragged, empty space clears the selection. */
  private nodeDown(p: Pt, shift: boolean): void {
    const item = this.nodeTarget();
    if (!item) {
      this.onStatus('Select one path to edit its nodes');
      return;
    }
    if (this.nodeItemId !== item.id) this.nodeSel.clear();
    this.nodeItemId = item.id;
    const tol = PICK_TOLERANCE_PX / this.ws.view.zoom;
    const hit = nearestNodeHit(item, p, tol);
    if (hit) {
      const { s, n, which } = hit;
      const key = nodeKey(s, n);
      if (which) {
        this.drag = { mode: 'handle', id: item.id, s, n, which, base: this.ws.state, moved: false };
        this.nodeSel = new Set([key]);
        this.afterSelectionChange();
        return;
      }
      if (shift) {
        if (this.nodeSel.has(key)) this.nodeSel.delete(key);
        else this.nodeSel.add(key);
      } else if (!this.nodeSel.has(key)) {
        this.nodeSel = new Set([key]);
      }
      this.drag = { mode: 'nodes', id: item.id, origin: p, base: this.ws.state, moved: false };
      this.requestRender();
      return;
    }
    if (!shift) this.nodeSel.clear();
    this.requestRender();
  }

  /** Smooth or corner the selected nodes (node tool). */
  setNodesSmooth(smooth: boolean): void {
    const item = this.nodeTarget();
    if (!item || this.nodeSel.size === 0) return;
    const keys = new Set(this.nodeSel);
    this.ws.edit(smooth ? 'Smooth nodes' : 'Corner nodes', (s) => mapItems(s, new Set([item.id]), (it) => setSmooth(it as PathItem, keys, smooth)));
  }

  /** Delete the selected nodes (node tool). A path with no nodes left is removed. */
  deleteNodeSelection(): void {
    const item = this.nodeTarget();
    if (!item || this.nodeSel.size === 0) return;
    const keys = new Set(this.nodeSel);
    this.nodeSel.clear();
    this.ws.edit('Delete nodes', (s) => {
      const next = deleteNodes(item, keys);
      return next ? mapItems(s, new Set([item.id]), () => next) : removeItems(s, new Set([item.id]));
    });
  }

  /** Pen: a press places a node; dragging bends it into a smooth node with a mirrored handle. */
  private penDown(p: Pt, s: Pt): void {
    if (!this.activeLayerVisible()) return;
    if (!this.pen) this.pen = { nodes: [], hover: p, dragging: false, downScreen: s };
    const pen = this.pen;
    const first = pen.nodes[0];
    if (first && pen.nodes.length >= 2 && dist(p, first.p) * this.ws.view.zoom <= PEN_CLOSE_PX) {
      this.finishPen(true);
      return;
    }
    pen.nodes.push({ p });
    pen.dragging = true;
    pen.downScreen = s;
    this.onStatus('Drag to make a smooth node. Click the first node to close, Enter to finish.');
    this.requestRender();
  }

  /** Commit the pen path (two nodes or more); a path with fewer is discarded. */
  finishPen(closed: boolean): void {
    const pen = this.pen;
    this.pen = null;
    if (pen && pen.nodes.length >= 2) {
      this.ws.addItem('Pen', { kind: 'path', id: uid('item'), subs: [{ nodes: pen.nodes, closed }], style: { ...this.style } });
    }
    this.requestRender();
  }

  private textDown(p: Pt, s: Pt): void {
    if (!this.activeLayerVisible()) return;
    this.onText({ ws: this.ws, at: p, screen: s, zoom: this.ws.view.zoom });
  }

  private brushDown(p: Pt): void {
    if (!this.activeLayerVisible()) return;
    this.drag = { mode: 'brush', pts: [p] };
    this.requestRender();
  }

  /** The stroke is recorded as one item when the pointer is released. */
  private commitBrush(pts: Pt[]): void {
    // A click with no movement becomes a dot: a zero-length segment with round caps.
    const stroke = pts.length === 1 ? [pts[0], pts[0]] : pts;
    this.ws.addItem('Brush', { kind: 'brush', id: uid('item'), pts: stroke, style: { ...this.style } });
  }

  // ---- script mask ----------------------------------------------------------

  /** True while the Modify mask session is open. */
  get maskEditing(): boolean {
    return this.maskEdit !== null;
  }

  /** Open a Modify mask session, starting from the current mask (or nothing selected). */
  beginMaskEdit(): void {
    const { width, height } = this.ws.state;
    // Without a mask, the whole canvas is the starting selection; Remove carves areas out of it.
    const draft = new Uint8Array((this.ws.activeMask() ?? this.wholeCanvasMask()).data);
    const overlay = document.createElement('canvas');
    overlay.width = width;
    overlay.height = height;
    this.maskEdit = { draft, overlay };
    this.maskBrush.op = 'add';
    this.maskVisible = true;
    this.drawTint(overlay, draft);
    this.requestRender();
    this.onUiChange();
  }

  /** Whether the mask brush adds or removes. Each Modify mask session starts with add. */
  get maskOp(): 'add' | 'remove' {
    return this.maskBrush.op;
  }

  /** The mask brush radius in document pixels. */
  get maskRadius(): number {
    return this.maskBrush.radius;
  }

  /** Set the mask brush: add or remove, and radius in document pixels. */
  setMaskBrush(patch: Partial<{ op: 'add' | 'remove'; radius: number }>): void {
    this.maskBrush = { ...this.maskBrush, ...patch };
  }

  /** Keep the painted selection as the script mask. Nothing selected means the whole canvas. */
  confirmMaskEdit(): void {
    const edit = this.maskEdit;
    if (!edit) return;
    const { width, height } = this.ws.state;
    this.maskEdit = null;
    this.ws.setMask(storedMask({ width, height, data: edit.draft }));
    this.requestRender();
    this.onUiChange();
  }

  /** Close the Modify mask session and keep the previous mask. */
  cancelMaskEdit(): void {
    if (!this.maskEdit) return;
    this.maskEdit = null;
    if (this.drag?.mode === 'mask') this.drag = null;
    this.requestRender();
    this.onUiChange();
  }

  setMaskVisible(visible: boolean): void {
    this.maskVisible = visible;
    this.requestRender();
    this.onUiChange();
  }

  private maskDown(p: Pt): void {
    this.drag = { mode: 'mask', last: p };
    this.paintMask(p, p);
  }

  /** Add or remove the brushed discs, then redraw the highlight from the draft. */
  private paintMask(a: Pt, b: Pt): void {
    const edit = this.maskEdit;
    if (!edit) return;
    const { width, height } = this.ws.state;
    paintStroke(edit.draft, width, height, a, b, this.maskBrush.radius, this.maskBrush.op === 'add' ? 1 : 0);
    this.drawTint(edit.overlay, edit.draft);
    this.requestRender();
  }

  /** The highlight to draw, if any: the session's draft while editing, else the saved mask when shown. */
  private maskOverlayCanvas(): HTMLCanvasElement | null {
    if (this.maskEdit) return this.maskEdit.overlay;
    if (!this.maskVisible) return null;
    const mask = this.ws.activeMask() ?? this.wholeCanvasMask();
    if (this.maskCache?.mask !== mask) {
      const canvas = document.createElement('canvas');
      canvas.width = mask.width;
      canvas.height = mask.height;
      this.drawTint(canvas, mask.data);
      this.maskCache = { mask, canvas };
    }
    return this.maskCache.canvas;
  }

  /** The full-canvas mask used when no mask is set. Cached, so its identity is stable for the highlight cache. */
  private wholeCanvasMask(): Mask {
    const { width, height } = this.ws.state;
    if (this.wholeMask?.width !== width || this.wholeMask?.height !== height) this.wholeMask = wholeCanvas(width, height);
    return this.wholeMask;
  }

  /** Write the selection into a canvas as the yellow highlight (transparent where not selected). */
  private drawTint(canvas: HTMLCanvasElement, data: Uint8Array): void {
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== 1) continue;
      img.data.set([MASK_TINT.r, MASK_TINT.g, MASK_TINT.b, MASK_TINT.a], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---- edge tool -----------------------------------------------------------

  /** Start (or continue) an Edge session on the active layer and paint at `p`. */
  private edgeDown(p: Pt): void {
    if (!this.activeLayerVisible()) return;
    const { width, height } = this.ws.state;
    if (!this.edge || this.edge.layerId !== this.ws.activeLayerId) {
      const overlay = document.createElement('canvas');
      overlay.width = width;
      overlay.height = height;
      this.edge = { layerId: this.ws.activeLayerId, work: renderToCanvas(this.ws.state, this.ws.activeLayerId), mask: emptyMask(width, height), overlay };
    }
    paintDisc(this.edge.mask, width, height, p, this.edgeRadius);
    this.paintOverlay(p, p);
    this.drag = { mode: 'edge', last: p };
    this.requestRender();
    this.onUiChange();
  }

  /** Draw the brush segment a→b into the tint overlay, matching the mask's brush radius. */
  private paintOverlay(a: Pt, b: Pt): void {
    const ctx = this.edge?.overlay.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = EDGE_TINT;
    ctx.fillStyle = EDGE_TINT;
    ctx.lineCap = 'round';
    ctx.lineWidth = this.edgeRadius * 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  /** True while an Edge cleanup is painted but not yet applied or cancelled. */
  get edgePending(): boolean {
    return this.edge !== null && this.edge.mask.includes(1);
  }

  /** Clean the brushed area and record one history step. Does nothing if nothing was brushed. */
  applyEdge(): void {
    const edge = this.edge;
    if (!edge || !edge.mask.includes(1)) return;
    const { width, height } = this.ws.state;
    const ctx = edge.work.getContext('2d', { willReadFrequently: true })!;
    const out = cleanEdge(ctx.getImageData(0, 0, width, height), edge.mask, this.edgeOpts);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    c.getContext('2d')!.putImageData(new ImageData(out.data, width, height), 0, 0);
    this.edge = null;
    this.ws.replaceLayerItems('Edge cleanup', edge.layerId, [imageItem(c)]);
    this.requestRender();
    this.onUiChange();
  }

  /** Drop the pending Edge cleanup without changing the document. */
  cancelEdge(): void {
    if (!this.edge) return;
    this.edge = null;
    this.requestRender();
    this.onUiChange();
  }

  /** Change how the Edge tool cleans (applies to the next Apply). */
  setEdgeOptions(patch: Partial<EdgeOptions>): void {
    this.edgeOpts = { ...this.edgeOpts, ...patch };
  }

  setEdgeRadius(radius: number): void {
    this.edgeRadius = radius;
    this.requestRender();
  }

  get edgeSettings(): { opts: EdgeOptions; radius: number } {
    return { opts: this.edgeOpts, radius: this.edgeRadius };
  }

  /** A document point moved onto the nearest grid line or guide, when snapping is on. */
  private snapPt(p: Pt): Pt {
    const { aids, view } = this.ws;
    if (!aids.snap) return p;
    const d = snapBox({ x: p.x, y: p.y, w: 0, h: 0 }, aids.guides, aids.gridSize, SNAP_PX / view.zoom);
    return { x: p.x + d.dx, y: p.y + d.dy };
  }

  /** Where the next point of a draft really goes: Shift constrains the second point (square, circle). */
  private aim(d: Draft, p: Pt, shift: boolean): Pt {
    const constrain = clickSpec(d.kind).constrain;
    return shift && d.pts.length === 1 && constrain ? constrain(d.pts[0], p) : p;
  }

  private drawDown(kind: ClickShapeKind, p: Pt, s: Pt, shift: boolean): void {
    if (!this.activeLayerVisible()) return;
    if (!this.draft) {
      this.draft = { kind, pts: [p], hover: p, pressing: true, downScreen: s };
    } else {
      this.draft.pts.push(this.aim(this.draft, p, shift));
      this.finishDraftIfComplete();
    }
    this.showDraftHint();
    this.requestRender();
  }

  /** While a shape is being drawn the status bar tells the user what to click next. */
  private showDraftHint(): void {
    if (this.draft) this.onStatus(hint(this.draft));
  }

  private finishDraftIfComplete(): void {
    const d = this.draft;
    if (!d || d.pts.length < clickSpec(d.kind).needed) return;
    const shape = buildShape(d.kind, d.pts, { ...this.style }, uid('item'), this.params);
    this.draft = null;
    if (!shape) return;
    this.ws.addItem(clickSpec(d.kind).label, shape);
  }

  private onPointerMove(e: PointerEvent): void {
    const s = this.screenPos(e);
    const p = toDoc(this.ws.view, s);
    this.hover = p;
    if (!this.draft) this.onStatus(`${Math.round(p.x)}, ${Math.round(p.y)}  ·  ${Math.round(this.ws.view.zoom * 100)}%`);
    if (this.pan) {
      this.ws.view = { ...this.ws.view, panX: this.pan.px + (s.x - this.pan.sx), panY: this.pan.py + (s.y - this.pan.sy) };
    } else if (this.pen) {
      const pen = this.pen;
      pen.hover = this.snapPt(p);
      if (pen.dragging && dist(this.screenPos(e), pen.downScreen) > PEN_DRAG_PX) {
        // Bend the node just placed: its outgoing handle follows the pointer, the incoming one mirrors it.
        const i = pen.nodes.length - 1;
        const anchor = pen.nodes[i].p;
        pen.nodes[i] = { p: anchor, out: pen.hover, in: { x: 2 * anchor.x - pen.hover.x, y: 2 * anchor.y - pen.hover.y } };
      }
    } else if (this.draft) {
      this.draft.hover = this.aim(this.draft, this.snapPt(p), e.shiftKey);
    } else if (this.drag?.mode === 'brush') {
      const last = this.drag.pts[this.drag.pts.length - 1];
      if (dist(p, last) * this.ws.view.zoom >= BRUSH_SPACING_PX) this.drag.pts.push(p);
    } else if (this.drag?.mode === 'mask' && this.maskEdit) {
      this.paintMask(this.drag.last, p);
      this.drag.last = p;
    } else if (this.drag?.mode === 'edge' && this.edge) {
      paintStroke(this.edge.mask, this.ws.state.width, this.ws.state.height, this.drag.last, p, this.edgeRadius);
      this.paintOverlay(this.drag.last, p);
      this.drag.last = p;
      this.requestRender();
    } else if (this.drag?.mode === 'move') {
      const d = this.drag;
      d.moved ||= dist(p, d.origin) * this.ws.view.zoom > 3;
      if (d.moved) {
        let dx = p.x - d.origin.x;
        let dy = p.y - d.origin.y;
        const { aids } = this.ws;
        if (aids.snap && d.box) {
          // Snap the moved box's edges and centre to the grid and guides.
          const snap = snapBox({ ...d.box, x: d.box.x + dx, y: d.box.y + dy }, aids.guides, aids.gridSize, SNAP_PX / this.ws.view.zoom);
          dx += snap.dx;
          dy += snap.dy;
        }
        this.ws.state = mapItems(d.base, this.ws.selection, (it) => translateItem(it, dx, dy));
      }
    } else if (this.drag?.mode === 'guide') {
      this.drag.pos = p[this.drag.axis];
    } else if (this.drag?.mode === 'gradient') {
      const d = this.drag;
      d.moved = true;
      const inv = invertM(d.transform ?? IDENTITY) ?? IDENTITY;
      const local = applyM(inv, p);
      this.ws.state = mapItems(d.base, new Set([d.id]), (it) =>
        styleOf(it)?.fillGradient ? { ...it, style: { ...styleOf(it)!, fillGradient: moveGradientHandle(styleOf(it)!.fillGradient!, d.which, local) } } : it,
      );
    } else if (this.drag?.mode === 'nodes') {
      const d = this.drag;
      d.moved = true;
      const keys = new Set(this.nodeSel);
      const dx = p.x - d.origin.x;
      const dy = p.y - d.origin.y;
      this.ws.state = mapItems(d.base, new Set([d.id]), (it) => moveNodes(it as PathItem, keys, dx, dy));
    } else if (this.drag?.mode === 'handle') {
      const d = this.drag;
      d.moved = true;
      this.ws.state = mapItems(d.base, new Set([d.id]), (it) => moveHandle(it as PathItem, d.s, d.n, d.which, p));
    } else if (this.drag?.mode === 'scale') {
      const d = this.drag;
      d.moved = true;
      const m = scaleMatrix(d.box, d.handle, p, e.shiftKey);
      this.ws.state = mapItems(d.base, d.ids, (it) => transformItem(it, m));
    } else if (this.drag?.mode === 'rotate') {
      const d = this.drag;
      d.moved = true;
      const m = rotateMatrix(d.center, angleAt(d.center, p) - d.start);
      this.ws.state = mapItems(d.base, d.ids, (it) => transformItem(it, m));
    } else if (this.drag?.mode === 'marquee') {
      const d = this.drag;
      d.cur = p;
      const r = rectFromPoints(d.origin, p);
      const next = new Set(d.baseSel);
      const hits = visibleItemsTopFirst(this.ws.state).filter((it) => rectsIntersect(itemBounds(it), r)).map((it) => it.id);
      // Layer mode: a box that touches an item selects that item's whole layer.
      const picked = this.selectMode === 'layer' ? sameLayerItemIds(this.ws.state, hits) : hits;
      for (const id of picked) next.add(id);
      this.ws.selection = next;
    }
    this.requestRender();
  }

  private onPointerUp(e: PointerEvent): void {
    this.pan = null;
    if (this.pen) this.pen.dragging = false;
    const d = this.draft;
    if (d?.pressing) {
      d.pressing = false;
      const p = toDoc(this.ws.view, this.screenPos(e));
      // Dragged far enough: treat the release point as the end point.
      if (dist(this.screenPos(e), d.downScreen) > 5) {
        d.pts.push(this.aim(d, this.snapPt(p), e.shiftKey));
        this.finishDraftIfComplete();
      }
    }
    const drag = this.drag;
    this.drag = null;
    if (drag?.mode === 'guide') this.addGuide(drag.axis, drag.pos);
    if (drag?.mode === 'brush') this.commitBrush(drag.pts);
    else if (drag && 'moved' in drag && drag.moved) this.ws.commit(COMMIT_LABELS[drag.mode]);
    if (drag) this.afterSelectionChange();
    this.showDraftHint();
    this.requestRender();
  }

  /** A guide dropped inside the document is kept; one dropped outside is discarded. */
  private addGuide(axis: 'x' | 'y', pos: number): void {
    const size = axis === 'x' ? this.ws.state.width : this.ws.state.height;
    if (pos < 0 || pos > size) return;
    this.ws.aids = { ...this.ws.aids, guides: { ...this.ws.aids.guides, [axis]: [...this.ws.aids.guides[axis], pos] } };
    this.ws.changed();
  }

  private afterSelectionChange(): void {
    const n = this.ws.selection.size;
    this.onStatus(n ? `${n} selected` : 'Nothing selected');
    this.onUiChange();
    this.requestRender();
  }

  // ---- keyboard / clipboard -----------------------------------------------

  private onKeyDown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (e.code === 'Space') {
      this.spaceDown = true;
      e.preventDefault();
    } else if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.ws.redo();
      else this.ws.undo();
    } else if (mod && key === 'y') {
      e.preventDefault();
      this.ws.redo();
    } else if (mod && key === 'a') {
      e.preventDefault();
      this.ws.selection = new Set(visibleItemsTopFirst(this.ws.state).map((it) => it.id));
      this.ws.pointSelection.clear();
      this.afterSelectionChange();
    } else if (mod && key === 'g') {
      e.preventDefault();
      if (e.shiftKey) this.ungroupSelection();
      else this.groupSelection();
    } else if (mod && (key === 'c' || key === 'x')) {
      e.preventDefault();
      this.copy();
      if (key === 'x') this.deleteSelection();
    } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      if (this.tool === 'node' && this.nodeSel.size) this.deleteNodeSelection();
      else this.deleteSelection();
    } else if (e.key === 'Enter' && this.pen) {
      e.preventDefault();
      this.finishPen(false);
    } else if (e.key === 'Enter' && this.maskEdit) {
      e.preventDefault();
      this.confirmMaskEdit();
    } else if (e.key === 'Enter' && this.edge) {
      e.preventDefault();
      this.applyEdge();
    } else if (e.key === 'Escape') {
      if (this.maskEdit) this.cancelMaskEdit();
      else if (this.edge) this.cancelEdge();
      else if (this.pen) this.finishPen(false);
      else if (this.draft) this.draft = null;
      else {
        this.ws.selection.clear();
        this.ws.pointSelection.clear();
      }
      this.afterSelectionChange();
    } else if (!mod && key === '0') {
      this.fit();
    } else if (!mod && key === '1') {
      this.zoomTo(1);
    } else if (!mod && TOOL_KEYS[key]) {
      this.setTool(TOOL_KEYS[key]);
    }
  }

  /** Group the selected items (Ctrl+G). The group becomes the new selection. */
  groupSelection(): void {
    const ids = new Set(this.ws.selectedItems(true).map((it) => it.id));
    if (ids.size < 2) return;
    const groupId = uid('item');
    this.ws.edit('Group', (s) => groupItems(s, ids, groupId));
    this.ws.selection = new Set([groupId]);
    this.afterSelectionChange();
  }

  /** Ungroup the selected groups (Ctrl+Shift+G). Their children become the selection. */
  ungroupSelection(): void {
    const groups = this.ws.selectedItems(true).filter((it) => it.kind === 'group');
    if (groups.length === 0) return;
    const groupIds = new Set(groups.map((g) => g.id));
    const childIds = groups.flatMap((g) => (g.kind === 'group' ? g.items.map((c) => c.id) : []));
    this.ws.edit('Ungroup', (s) => ungroupItems(s, groupIds));
    this.ws.selection = new Set(childIds);
    this.afterSelectionChange();
  }

  copy(): void {
    const items = this.ws.selectedItems();
    if (items.length === 0) return;
    this.clipboard = items;
    this.pasteCount = 0;
    this.onStatus(`Copied ${items.length} item${items.length > 1 ? 's' : ''}`);
  }

  deleteSelection(): void {
    if (this.ws.deleteSelected()) this.afterSelectionChange();
  }

  private onPaste(e: ClipboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
    if (file) {
      e.preventDefault();
      this.onImageFile(file);
      return;
    }
    if (this.clipboard.length === 0) return;
    e.preventDefault();
    this.pasteClipboard();
  }

  pasteClipboard(): void {
    if (this.clipboard.length === 0) return;
    const off = 12 * ++this.pasteCount;
    this.ws.paste(this.clipboard, off, off);
    this.afterSelectionChange();
  }

  // ---- rendering ----------------------------------------------------------

  requestRender(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  }

  private render(): void {
    const ws = this.ws;
    if (!ws || !this.sized) return;
    if (!ws.view.fitted) this.fit();
    const box = this.selectionBox();
    drawScene(this.ctx, {
      state: ws.state,
      view: ws.view,
      size: this.canvasSize(),
      dpr: this.dpr,
      selected: ws.selectedItems(true),
      selectedPoints: ws.selectedPoints(),
      draft: this.draft,
      stroke: this.drag?.mode === 'brush' ? this.drag.pts : null,
      style: this.style,
      params: this.params,
      handles: box && this.tool === 'select' ? handlesFor(box, ws.view.zoom) : null,
      marquee: this.drag?.mode === 'marquee' ? rectFromPoints(this.drag.origin, this.drag.cur) : null,
      brushCursor: this.hover && (this.maskEditing || this.tool === 'brush' || this.tool === 'edge')
        ? { at: this.hover, width: this.maskEditing ? this.maskRadius * 2 : this.tool === 'edge' ? this.edgeRadius * 2 : this.style.width }
        : null,
      edgeOverlay: this.edge?.overlay ?? null,
      maskOverlay: this.maskOverlayCanvas(),
      aids: ws.aids,
      penDraft: this.pen ? { nodes: this.pen.nodes, hover: this.pen.hover } : null,
      gradientLines: this.gradientLines(),
      nodeEdit: this.tool === 'node' && this.nodeTarget() ? { item: this.nodeTarget()!, sel: this.nodeSel } : null,
      guideDraft: this.drag?.mode === 'guide' ? { axis: this.drag.axis, pos: this.drag.pos } : null,
    });
  }
}

function hint(d: Draft): string {
  if (d.pts.length < 2) return 'Release (or click) to set the end point';
  return clickSpec(d.kind).hint(d.pts.length);
}
