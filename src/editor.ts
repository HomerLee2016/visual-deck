import {
  buildShape,
  clickSpec,
  dist,
  hitTest,
  itemBounds,
  rectFromPoints,
  rectsIntersect,
  translateItem,
  type ClickShapeKind,
} from './geometry';
import { typeOf } from './items/registry';
import { DEFAULT_TEXT_STYLE, type TextStyle } from './items/text';
import { angleAt, centerOf, handlesFor, hitHandle, rotateMatrix, scaleMatrix, type HandleId } from './handles';
import type { Rect } from './math';
import { transformItem } from './geometry';
import { groupItems, ungroupItems } from './arrange';
import { RULER_PX } from './render';
import { snapBox } from './snap';
import { DEFAULT_SHAPE_PARAMS, type ShapeParams } from './items/types';
import { DEFAULT_STYLE, Workspace, mapItems, uid, visibleItemsTopFirst } from './model';
import { drawScene } from './render';
import type { DocState, Item, Pt, ShapeKind, Style, TextItem } from './types';
import { fitView, toDoc, zoomAround, type Size } from './view';

export type ToolId = 'select' | Exclude<ShapeKind, 'path'> | 'text';

export const TOOL_KEYS: Record<string, ToolId> = { v: 'select', l: 'line', a: 'arc', c: 'curve', b: 'brush', r: 'rect', e: 'ellipse', g: 'polygon', s: 'star', t: 'text' };

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
  | { mode: 'scale'; handle: HandleId; box: Rect; ids: Set<string>; base: DocState; moved: boolean }
  | { mode: 'rotate'; center: Pt; start: number; ids: Set<string>; base: DocState; moved: boolean }
  | { mode: 'marquee'; origin: Pt; cur: Pt; additive: boolean; baseSel: Set<string> }
  | { mode: 'brush'; pts: Pt[] };

const PICK_TOLERANCE_PX = 6;
/** How close (screen pixels) the pointer must be to a selection handle to grab it. */
const HANDLE_TOLERANCE_PX = 6;
/** How close (screen pixels) a moved edge must be to a grid line or guide to snap to it. */
const SNAP_PX = 6;
/** Minimum screen distance between recorded brush points; denser samples add nothing visible. */
const BRUSH_SPACING_PX = 2;
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

/** Owns the main canvas: view transform, tools and all pointer/keyboard input for the active workspace. */
export class Editor {
  tool: ToolId = 'select';
  style: Style = { ...DEFAULT_STYLE };
  /** Creation-time settings for click-placed shapes (corner radius, polygon sides, star depth). */
  params: ShapeParams = { ...DEFAULT_SHAPE_PARAMS };
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
    this.ws = ws;
    this.unsub = ws.subscribe(() => this.requestRender());
    this.pasteCount = 0;
    this.requestRender();
    this.onUiChange();
  }

  setTool(t: ToolId): void {
    this.cancelInteraction();
    this.tool = t;
    this.canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    this.onUiChange();
  }

  setParams(patch: Partial<ShapeParams>): void {
    this.params = { ...this.params, ...patch };
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

  /** Change the drawing style; also restyles selected shapes when `applyToSelection`. */
  setStyle(patch: Partial<Style>, applyToSelection = false): void {
    this.style = { ...this.style, ...patch };
    if (applyToSelection) {
      const ids = this.ws.selection;
      const hasStyled = this.ws.selectedItems().some((it) => typeOf(it).withStyle);
      if (hasStyled) {
        this.ws.edit('Change style', (s) => mapItems(s, ids, (it) => typeOf(it).withStyle?.(it, this.style) ?? it));
      }
    }
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
    this.requestRender();
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
    if (this.tool === 'select' && this.handleDown(p)) return;
    // New points (shapes and text) snap; freehand brush points and selection do not.
    if (this.tool !== 'select' && this.tool !== 'brush') p = this.snapPt(p);
    if (this.tool === 'select') this.selectDown(p, e.shiftKey);
    else if (this.tool === 'brush') this.brushDown(p);
    else if (this.tool === 'text') this.textDown(p, s);
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
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const it of items) {
      const b = itemBounds(it);
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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

  /** Double-clicking a text item re-opens it for editing. */
  private onDoubleClick(e: MouseEvent): void {
    if (this.tool !== 'select') return;
    const screen = this.screenPos(e);
    const hit = this.pick(toDoc(this.ws.view, screen));
    if (hit?.kind === 'text') this.onText({ ws: this.ws, at: { x: hit.x, y: hit.y }, screen, zoom: this.ws.view.zoom, item: hit });
  }

  private selectDown(p: Pt, shift: boolean): void {
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

  private textDown(p: Pt, s: Pt): void {
    if (!this.ws.activeLayer.visible) {
      this.onStatus(HIDDEN_LAYER_MSG);
      return;
    }
    this.onText({ ws: this.ws, at: p, screen: s, zoom: this.ws.view.zoom });
  }

  private brushDown(p: Pt): void {
    if (!this.ws.activeLayer.visible) {
      this.onStatus(HIDDEN_LAYER_MSG);
      return;
    }
    this.drag = { mode: 'brush', pts: [p] };
    this.requestRender();
  }

  /** The stroke is recorded as one item when the pointer is released. */
  private commitBrush(pts: Pt[]): void {
    // A click with no movement becomes a dot: a zero-length segment with round caps.
    const stroke = pts.length === 1 ? [pts[0], pts[0]] : pts;
    this.ws.addItem('Brush', { kind: 'brush', id: uid('item'), pts: stroke, style: { ...this.style } });
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
    if (!this.ws.activeLayer.visible) {
      this.onStatus(HIDDEN_LAYER_MSG);
      return;
    }
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
    } else if (this.draft) {
      this.draft.hover = this.aim(this.draft, this.snapPt(p), e.shiftKey);
    } else if (this.drag?.mode === 'brush') {
      const last = this.drag.pts[this.drag.pts.length - 1];
      if (dist(p, last) * this.ws.view.zoom >= BRUSH_SPACING_PX) this.drag.pts.push(p);
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
      for (const it of visibleItemsTopFirst(this.ws.state)) if (rectsIntersect(itemBounds(it), r)) next.add(it.id);
      this.ws.selection = next;
    }
    this.requestRender();
  }

  private onPointerUp(e: PointerEvent): void {
    this.pan = null;
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
    if (drag?.mode === 'move' && drag.moved) this.ws.commit('Move');
    if (drag?.mode === 'scale' && drag.moved) this.ws.commit('Scale');
    if (drag?.mode === 'rotate' && drag.moved) this.ws.commit('Rotate');
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
      this.deleteSelection();
    } else if (e.key === 'Escape') {
      if (this.draft) this.draft = null;
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
      brushCursor: this.tool === 'brush' && this.hover ? { at: this.hover, width: this.style.width } : null,
      aids: ws.aids,
      guideDraft: this.drag?.mode === 'guide' ? { axis: this.drag.axis, pos: this.drag.pos } : null,
    });
  }
}

function hint(d: Draft): string {
  if (d.pts.length < 2) return 'Release (or click) to set the end point';
  return clickSpec(d.kind).hint(d.pts.length);
}
