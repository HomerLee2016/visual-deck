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
import { DEFAULT_STYLE, Workspace, mapItems, uid, visibleItemsTopFirst } from './model';
import { drawScene } from './render';
import type { DocState, Item, Pt, ShapeKind, Style } from './types';
import { fitView, toDoc, zoomAround, type Size } from './view';

export type ToolId = 'select' | ShapeKind;

export const TOOL_KEYS: Record<string, ToolId> = { v: 'select', l: 'line', a: 'arc', c: 'curve', b: 'brush' };

interface Draft {
  kind: ClickShapeKind;
  pts: Pt[];
  hover: Pt;
  /** True between pointerdown and pointerup of the first point (allows press-drag-release for start->end). */
  pressing: boolean;
  downScreen: Pt;
}

type Drag =
  | { mode: 'move'; origin: Pt; base: DocState; moved: boolean }
  | { mode: 'marquee'; origin: Pt; cur: Pt; additive: boolean; baseSel: Set<string> }
  | { mode: 'brush'; pts: Pt[] };

const PICK_TOLERANCE_PX = 6;
/** Minimum screen distance between recorded brush points; denser samples add nothing visible. */
const BRUSH_SPACING_PX = 2;
const HIDDEN_LAYER_MSG = 'The active layer is hidden – show it or pick another layer first.';

/** Owns the main canvas: view transform, tools and all pointer/keyboard input for the active workspace. */
export class Editor {
  tool: ToolId = 'select';
  style: Style = { ...DEFAULT_STYLE };
  clipboard: Item[] = [];
  ws!: Workspace;
  /** Called when tool/selection state changes so the toolbox can refresh. */
  onUiChange: () => void = () => {};
  onStatus: (msg: string) => void = () => {};
  /** Called with a pasted/dropped image file. */
  onImageFile: (file: File) => void = () => {};

  private ctx: CanvasRenderingContext2D;
  private draft: Draft | null = null;
  private drag: Drag | null = null;
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
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
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
    if (this.drag?.mode === 'move' && this.drag.moved) this.ws.state = this.drag.base;
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
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.pan = { sx: s.x, sy: s.y, px: this.ws.view.panX, py: this.ws.view.panY };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = toDoc(this.ws.view, s);
    if (this.tool === 'select') this.selectDown(p, e.shiftKey);
    else if (this.tool === 'brush') this.brushDown(p);
    else this.drawDown(this.tool, p, s);
  }

  private selectDown(p: Pt, shift: boolean): void {
    const sel = this.ws.selection;
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
      this.drag = { mode: 'move', origin: p, base: this.ws.state, moved: false };
    } else {
      if (!shift) sel.clear();
      this.drag = { mode: 'marquee', origin: p, cur: p, additive: shift, baseSel: new Set(sel) };
    }
    this.afterSelectionChange();
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

  private drawDown(kind: ClickShapeKind, p: Pt, s: Pt): void {
    if (!this.ws.activeLayer.visible) {
      this.onStatus(HIDDEN_LAYER_MSG);
      return;
    }
    if (!this.draft) {
      this.draft = { kind, pts: [p], hover: p, pressing: true, downScreen: s };
    } else {
      this.draft.pts.push(p);
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
    const shape = buildShape(d.kind, d.pts, { ...this.style }, uid('item'));
    this.draft = null;
    if (!shape) return;
    this.ws.addItem(clickSpec(d.kind).label, shape);
  }

  private onPointerMove(e: PointerEvent): void {
    const s = this.screenPos(e);
    const p = toDoc(this.ws.view, s);
    if (!this.draft) this.onStatus(`${Math.round(p.x)}, ${Math.round(p.y)}  ·  ${Math.round(this.ws.view.zoom * 100)}%`);
    if (this.pan) {
      this.ws.view = { ...this.ws.view, panX: this.pan.px + (s.x - this.pan.sx), panY: this.pan.py + (s.y - this.pan.sy) };
    } else if (this.draft) {
      this.draft.hover = p;
    } else if (this.drag?.mode === 'brush') {
      const last = this.drag.pts[this.drag.pts.length - 1];
      if (dist(p, last) * this.ws.view.zoom >= BRUSH_SPACING_PX) this.drag.pts.push(p);
    } else if (this.drag?.mode === 'move') {
      const d = this.drag;
      d.moved ||= dist(p, d.origin) * this.ws.view.zoom > 3;
      if (d.moved) {
        const dx = p.x - d.origin.x;
        const dy = p.y - d.origin.y;
        this.ws.state = mapItems(d.base, this.ws.selection, (it) => translateItem(it, dx, dy));
      }
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
        d.pts.push(p);
        this.finishDraftIfComplete();
      }
    }
    const drag = this.drag;
    this.drag = null;
    if (drag?.mode === 'brush') this.commitBrush(drag.pts);
    if (drag?.mode === 'move' && drag.moved) this.ws.commit('Move');
    if (drag) this.afterSelectionChange();
    this.showDraftHint();
    this.requestRender();
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
      this.afterSelectionChange();
    } else if (mod && (key === 'c' || key === 'x')) {
      e.preventDefault();
      this.copy();
      if (key === 'x') this.deleteSelection();
    } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      this.deleteSelection();
    } else if (e.key === 'Escape') {
      if (this.draft) this.draft = null;
      else this.ws.selection.clear();
      this.afterSelectionChange();
    } else if (!mod && key === '0') {
      this.fit();
    } else if (!mod && key === '1') {
      this.zoomTo(1);
    } else if (!mod && TOOL_KEYS[key]) {
      this.setTool(TOOL_KEYS[key]);
    }
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
    drawScene(this.ctx, {
      state: ws.state,
      view: ws.view,
      size: this.canvasSize(),
      dpr: this.dpr,
      selected: ws.selectedItems(true),
      draft: this.draft,
      stroke: this.drag?.mode === 'brush' ? this.drag.pts : null,
      style: this.style,
      marquee: this.drag?.mode === 'marquee' ? rectFromPoints(this.drag.origin, this.drag.cur) : null,
    });
  }
}

function hint(d: Draft): string {
  if (d.pts.length < 2) return 'Release (or click) to set the end point';
  return clickSpec(d.kind).hint(d.pts.length);
}
