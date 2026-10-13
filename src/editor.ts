import { POINTS_NEEDED, buildShape, dist, hitTest, itemBounds, rectsIntersect, translateItem } from './geometry';
import type { Rect } from './geometry';
import { Workspace, mapItems, uid, visibleItemsTopFirst } from './model';
import { drawItem, drawSelection, drawState } from './render';
import type { DocState, Item, Pt, ShapeKind, Style } from './types';

export type ToolId = 'select' | ShapeKind;

export const TOOL_KEYS: Record<string, ToolId> = { v: 'select', l: 'line', a: 'arc', c: 'curve' };

interface Draft {
  kind: ShapeKind;
  pts: Pt[];
  hover: Pt;
  /** True between pointerdown and pointerup of the first point (allows press-drag-release for start->end). */
  pressing: boolean;
  downScreen: Pt;
}

type Drag =
  | { mode: 'move'; origin: Pt; base: DocState; moved: boolean }
  | { mode: 'marquee'; origin: Pt; cur: Pt; additive: boolean; baseSel: Set<string> };

const PICK_TOLERANCE_PX = 6;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 64;

/** Owns the main canvas: view transform, tools and all pointer/keyboard input for the active workspace. */
export class Editor {
  tool: ToolId = 'select';
  style: Style = { color: '#ffcc00', width: 2 };
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
  private checker: CanvasPattern | null = null;
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
      const hasShape = this.ws.selectedItems().some((it) => it.kind !== 'image');
      if (hasShape) {
        this.ws.selection = new Set(ids);
        this.ws.edit('Change style', (s) =>
          mapItems(s, ids, (it) => (it.kind === 'image' ? it : { ...it, style: { ...this.style } })),
        );
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

  fit(): void {
    if (!this.ws) return;
    const v = this.ws.view;
    const cw = this.canvas.width / this.dpr;
    const ch = this.canvas.height / this.dpr;
    const { width, height } = this.ws.state;
    v.zoom = Math.min(4, Math.max(MIN_ZOOM, Math.min((cw - 48) / width, (ch - 48) / height)));
    v.panX = (cw - width * v.zoom) / 2;
    v.panY = (ch - height * v.zoom) / 2;
    v.fitted = true;
    this.requestRender();
  }

  zoomTo(zoom: number, around?: Pt): void {
    const v = this.ws.view;
    const cw = this.canvas.width / this.dpr;
    const ch = this.canvas.height / this.dpr;
    const c = around ?? { x: cw / 2, y: ch / 2 };
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    v.panX = c.x - ((c.x - v.panX) / v.zoom) * z;
    v.panY = c.y - ((c.y - v.panY) / v.zoom) * z;
    v.zoom = z;
    this.requestRender();
  }

  private screenPos(e: { clientX: number; clientY: number }): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private toDoc(s: Pt): Pt {
    const v = this.ws.view;
    return { x: (s.x - v.panX) / v.zoom, y: (s.y - v.panY) / v.zoom };
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
    const p = this.toDoc(s);
    if (this.tool === 'select') this.selectDown(p, e.shiftKey);
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

  private drawDown(kind: ShapeKind, p: Pt, s: Pt): void {
    if (!this.ws.activeLayer.visible) {
      this.onStatus('The active layer is hidden – show it or pick another layer first.');
      return;
    }
    if (!this.draft) {
      this.draft = { kind, pts: [p], hover: p, pressing: true, downScreen: s };
    } else {
      this.draft.pts.push(p);
      this.finishDraftIfComplete();
    }
    this.requestRender();
  }

  private finishDraftIfComplete(): void {
    const d = this.draft;
    if (!d || d.pts.length < POINTS_NEEDED[d.kind]) return;
    const shape = buildShape(d.kind, d.pts, { ...this.style }, uid('item'));
    this.draft = null;
    if (!shape) return;
    const label = d.kind === 'line' ? 'Line' : d.kind === 'arc' ? 'Arc' : 'Curve';
    this.ws.addItem(label, shape);
  }

  private onPointerMove(e: PointerEvent): void {
    const s = this.screenPos(e);
    const p = this.toDoc(s);
    this.onStatus(`${Math.round(p.x)}, ${Math.round(p.y)}  ·  ${Math.round(this.ws.view.zoom * 100)}%`);
    if (this.pan) {
      const v = this.ws.view;
      v.panX = this.pan.px + (s.x - this.pan.sx);
      v.panY = this.pan.py + (s.y - this.pan.sy);
    } else if (this.draft) {
      this.draft.hover = p;
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
      const r = rectOf(d.origin, p);
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
      const p = this.toDoc(this.screenPos(e));
      // Dragged far enough: treat the release point as the end point.
      if (dist(this.screenPos(e), d.downScreen) > 5) {
        d.pts.push(p);
        this.finishDraftIfComplete();
      }
    }
    const drag = this.drag;
    this.drag = null;
    if (drag?.mode === 'move' && drag.moved) this.ws.commit('Move');
    if (drag) this.afterSelectionChange();
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

  private checkerPattern(): CanvasPattern {
    if (!this.checker) {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const g = c.getContext('2d')!;
      g.fillStyle = '#4a4a52';
      g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#585862';
      g.fillRect(0, 0, 8, 8);
      g.fillRect(8, 8, 8, 8);
      this.checker = this.ctx.createPattern(c, 'repeat')!;
    }
    return this.checker;
  }

  private render(): void {
    const ws = this.ws;
    if (!ws) return;
    if (!this.sized) return;
    if (!ws.view.fitted) this.fit();
    const { zoom, panX, panY } = ws.view;
    const { width, height } = ws.state;
    const ctx = this.ctx;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#26262b';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(panX, panY, width * zoom, height * zoom);
    ctx.clip();
    ctx.fillStyle = this.checkerPattern();
    ctx.fillRect(panX, panY, width * zoom, height * zoom);
    ctx.restore();

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);
    ctx.imageSmoothingEnabled = zoom < 2;
    drawState(ctx, ws.state);

    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = '#8a8a96';
    ctx.strokeRect(0, 0, width, height);

    drawSelection(ctx, ws.selectedItems().filter((it) => this.isVisibleItem(it)), zoom);
    this.drawDraft(ctx, zoom);
    this.drawMarquee(ctx, zoom);
    ctx.restore();
  }

  private isVisibleItem(it: Item): boolean {
    return this.ws.state.layers.some((l) => l.visible && l.items.includes(it));
  }

  private drawDraft(ctx: CanvasRenderingContext2D, zoom: number): void {
    const d = this.draft;
    if (!d) return;
    const pts = [...d.pts];
    // The hovered position stands in for the next point to be placed.
    pts.push(d.hover);
    const shape = buildShape(d.kind, pts, { ...this.style }, 'preview');
    if (shape) {
      ctx.globalAlpha = 0.8;
      drawItem(ctx, shape);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#4da3ff';
    const r = 3.5 / zoom;
    for (const p of d.pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    this.onStatus(hint(d));
  }

  private drawMarquee(ctx: CanvasRenderingContext2D, zoom: number): void {
    const d = this.drag;
    if (d?.mode !== 'marquee') return;
    const r = rectOf(d.origin, d.cur);
    ctx.fillStyle = 'rgba(77,163,255,0.12)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.lineWidth = 1 / zoom;
    ctx.strokeStyle = '#4da3ff';
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
}

function rectOf(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function hint(d: Draft): string {
  const n = d.pts.length;
  if (n < 2) return 'Release (or click) to set the end point';
  if (d.kind === 'arc') return 'Click a point the arc passes through';
  return n === 2 ? 'Click control point 1' : 'Click control point 2';
}
