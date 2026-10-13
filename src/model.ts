import { translateItem } from './geometry';
import type { Guides } from './snap';
import type { DocState, HistoryEntry, ImageItem, Item, Layer, Style } from './types';
import { INITIAL_VIEW, type View } from './view';

let counter = 0;
export const uid = (prefix: string) => `${prefix}${++counter}`;

/** Make sure future `uid`s never collide with an id that came from a loaded file. */
export function reserveUid(id: string): void {
  const n = Number(/(\d+)$/.exec(id)?.[1]);
  if (Number.isFinite(n) && n > counter) counter = n;
}

export type Thumbnailer = (state: DocState) => string | null;

export interface ViewAids {
  showGrid: boolean;
  /** Snap moves to the grid and guides. */
  snap: boolean;
  gridSize: number;
  /** Guide lines in document units: `x` are vertical, `y` horizontal. */
  guides: Guides;
}

export const MAX_HISTORY = 100;

export function newLayer(name: string, items: Item[] = []): Layer {
  return { id: uid('layer'), name, visible: true, items };
}

export const DEFAULT_STYLE: Style = { color: '#ffcc00', width: 2 };

/** A bitmap item at the document origin (or at `x`, `y`). */
export function imageItem(canvas: HTMLCanvasElement, x = 0, y = 0): ImageItem {
  return { kind: 'image', id: uid('item'), x, y, canvas };
}

export function cloneItem(it: Item): Item {
  return { ...it, id: uid('item') };
}

const mapLayer = (s: DocState, id: string, fn: (l: Layer) => Layer): DocState => ({
  ...s,
  layers: s.layers.map((l) => (l.id === id ? fn(l) : l)),
});

/** All items on visible layers, topmost first (the order used for picking). */
export function visibleItemsTopFirst(s: DocState): Item[] {
  const out: Item[] = [];
  for (let i = s.layers.length - 1; i >= 0; i--) {
    const l = s.layers[i];
    if (!l.visible) continue;
    for (let j = l.items.length - 1; j >= 0; j--) out.push(l.items[j]);
  }
  return out;
}

/** The layer that holds the item with this id, if any. */
export function layerOfItem(s: DocState, id: string): Layer | undefined {
  return s.layers.find((l) => l.items.some((it) => it.id === id));
}

/** Ids of every item on the layers that hold any of `ids` (used by layer-mode selection). */
export function sameLayerItemIds(s: DocState, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const layer = layerOfItem(s, id);
    if (layer) for (const it of layer.items) out.add(it.id);
  }
  return out;
}

export function removeItems(s: DocState, ids: ReadonlySet<string>): DocState {
  return { ...s, layers: s.layers.map((l) => ({ ...l, items: l.items.filter((it) => !ids.has(it.id)) })) };
}

/**
 * Remove points from brush strokes, keyed by item id then point index. A stroke
 * left with fewer than two points is removed, since it can no longer be drawn.
 */
export function removePoints(s: DocState, points: ReadonlyMap<string, ReadonlySet<number>>): DocState {
  return {
    ...s,
    layers: s.layers.map((l) => ({
      ...l,
      items: l.items.flatMap((it): Item[] => {
        const drop = points.get(it.id);
        if (it.kind !== 'brush' || !drop) return [it];
        const pts = it.pts.filter((_, i) => !drop.has(i));
        return pts.length < 2 ? [] : [{ ...it, pts }];
      }),
    })),
  };
}

export function mapItems(s: DocState, ids: ReadonlySet<string>, fn: (it: Item) => Item): DocState {
  return {
    ...s,
    layers: s.layers.map((l) => ({ ...l, items: l.items.map((it) => (ids.has(it.id) ? fn(it) : it)) })),
  };
}

/**
 * One tab: a document, its edit history and its view. `state` is immutable;
 * edits replace it. `edit(label, fn)` records a history step when `label` is
 * given, while `edit(null, fn)` changes the state without recording (used by
 * scripts, which record one step for the whole run).
 */
export class Workspace {
  readonly id = uid('ws');
  state: DocState;
  activeLayerId: string;
  selection = new Set<string>();
  /** Selected points of brush strokes: item id -> point indices. Only used for items that are also selected. */
  pointSelection = new Map<string, Set<number>>();
  history: HistoryEntry[];
  index = 0;
  view: View = INITIAL_VIEW;
  /** Grid, snapping and guides. Part of the view, so changing them is not a history step. */
  aids: ViewAids = { showGrid: false, snap: false, gridSize: 16, guides: { x: [], y: [] } };
  /** Saved swatches. Part of the workspace, not the document, so changing them is not a history step. */
  palette: string[] = [];
  /** The state last saved to (or loaded from) a file; `dirty` compares against it. */
  private savedState: DocState;
  private subs = new Set<() => void>();
  private layerCount = 1;

  constructor(
    public name: string,
    width: number,
    height: number,
    private thumb: Thumbnailer = () => null,
    layers: Layer[] = [newLayer('Layer 1')],
  ) {
    this.state = { width, height, layers };
    this.activeLayerId = layers[layers.length - 1].id;
    this.layerCount = layers.length;
    this.history = [{ label: 'Initial', state: this.state, thumb: this.thumb(this.state) }];
    this.savedState = this.state;
  }

  /** True when the document differs from what was last saved or loaded. */
  get dirty(): boolean {
    return this.state !== this.savedState;
  }

  markSaved(): void {
    this.savedState = this.state;
    this.changed();
  }

  /** Replace everything with a loaded project's history; the loaded state counts as saved. */
  restore(history: { label: string; state: DocState }[], index: number, activeLayerId: string, view: View, palette: string[] = []): void {
    this.palette = palette;
    this.history = history.map((h) => ({ ...h, thumb: this.thumb(h.state) }));
    this.index = index;
    this.state = this.history[index].state;
    this.savedState = this.state;
    this.activeLayerId = activeLayerId;
    this.layerCount = Math.max(this.layerCount, this.state.layers.length);
    this.view = view;
    this.selection.clear();
    this.reconcile();
    this.changed();
  }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  /** Tell panels the document or history changed. */
  changed(): void {
    for (const fn of this.subs) fn();
  }

  get activeLayer(): Layer {
    return this.state.layers.find((l) => l.id === this.activeLayerId) ?? this.state.layers[this.state.layers.length - 1];
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.history.length - 1;
  }

  edit(label: string | null, fn: (s: DocState) => DocState): void {
    this.apply(label, fn, false);
  }

  /** Replace the state, optionally dropping references the edit invalidated, then notify once. */
  private apply(label: string | null, fn: (s: DocState) => DocState, reconcile: boolean): void {
    this.state = fn(this.state);
    if (reconcile) this.reconcile();
    if (label) this.commit(label);
    else this.changed();
  }

  /** Record the current state as a new history step (drops any redo steps). Returns false if nothing changed. */
  commit(label: string): boolean {
    if (this.state === this.history[this.index].state) return false;
    this.history.length = this.index + 1;
    this.history.push({ label, state: this.state, thumb: this.thumb(this.state) });
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.index = this.history.length - 1;
    this.changed();
    return true;
  }

  jump(i: number): void {
    if (i < 0 || i >= this.history.length || i === this.index) return;
    this.index = i;
    this.state = this.history[i].state;
    this.reconcile();
    this.changed();
  }

  undo(): void {
    this.jump(this.index - 1);
  }

  redo(): void {
    this.jump(this.index + 1);
  }

  /** Drop selection / active layer references that no longer exist or are hidden. */
  private reconcile(): void {
    const live = new Set(visibleItemsTopFirst(this.state).map((it) => it.id));
    for (const id of this.selection) if (!live.has(id)) this.selection.delete(id);
    for (const id of this.pointSelection.keys()) if (!this.selection.has(id)) this.pointSelection.delete(id);
    if (!this.state.layers.some((l) => l.id === this.activeLayerId)) {
      this.activeLayerId = this.state.layers[this.state.layers.length - 1].id;
    }
  }

  // ---- layers -------------------------------------------------------------

  addLayer(label: string | null, name?: string, items: Item[] = []): string {
    const layer = newLayer(name ?? `Layer ${++this.layerCount}`, items);
    this.edit(null, (s) => ({ ...s, layers: [...s.layers, layer] }));
    this.activeLayerId = layer.id;
    if (label) this.commit(label);
    return layer.id;
  }

  removeLayer(id: string): void {
    if (this.state.layers.length <= 1) return;
    const label = `Delete ${this.state.layers.find((l) => l.id === id)?.name ?? 'layer'}`;
    this.apply(label, (s) => ({ ...s, layers: s.layers.filter((l) => l.id !== id) }), true);
  }

  /** dir +1 moves the layer up (towards the top of the stack). */
  moveLayer(id: string, dir: 1 | -1): void {
    const i = this.state.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.state.layers.length) return;
    this.edit('Reorder layers', (s) => {
      const layers = [...s.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...s, layers };
    });
  }

  /**
   * Merge a layer into the layer directly below it. The lower layer keeps its
   * id and name, its items stay under the upper layer's items, and the result
   * is hidden if either layer was hidden, so nothing is revealed by merging.
   */
  mergeLayerDown(id: string): void {
    const i = this.state.layers.findIndex((l) => l.id === id);
    if (i <= 0) return;
    const upper = this.state.layers[i];
    const lower = this.state.layers[i - 1];
    this.activeLayerId = lower.id;
    this.apply(`Merge ${upper.name} into ${lower.name}`, (s) => {
      const merged: Layer = { ...lower, visible: lower.visible && upper.visible, items: [...lower.items, ...upper.items] };
      return { ...s, layers: s.layers.flatMap((l) => (l.id === lower.id ? [merged] : l.id === upper.id ? [] : [l])) };
    }, true);
  }

  setLayerVisible(id: string, visible: boolean): void {
    const l = this.state.layers.find((x) => x.id === id);
    if (!l || l.visible === visible) return;
    this.apply(`${visible ? 'Show' : 'Hide'} ${l.name}`, (s) => mapLayer(s, id, (x) => ({ ...x, visible })), true);
  }

  /** Show or hide every layer in one history step. */
  setAllLayersVisible(visible: boolean): void {
    if (this.state.layers.every((l) => l.visible === visible)) return;
    this.apply(visible ? 'Show all layers' : 'Hide all layers', (s) => ({ ...s, layers: s.layers.map((l) => ({ ...l, visible })) }), true);
  }

  renameLayer(id: string, name: string): void {
    this.edit('Rename layer', (s) => mapLayer(s, id, (x) => ({ ...x, name })));
  }

  replaceLayerItems(label: string | null, id: string, items: Item[]): void {
    this.edit(label, (s) => mapLayer(s, id, (x) => ({ ...x, items })));
  }

  // ---- items --------------------------------------------------------------

  addItem(label: string | null, item: Item, layerId = this.activeLayerId): void {
    this.edit(label, (s) => mapLayer(s, layerId, (l) => ({ ...l, items: [...l.items, item] })));
  }

  /** Selected items in stacking order; `visibleOnly` skips items on hidden layers. */
  selectedItems(visibleOnly = false): Item[] {
    const out: Item[] = [];
    for (const l of this.state.layers) {
      if (visibleOnly && !l.visible) continue;
      for (const it of l.items) if (this.selection.has(it.id)) out.push(it);
    }
    return out;
  }

  /** Selected points of selected brush strokes, in the same shape as `pointSelection`. */
  selectedPoints(): Map<string, Set<number>> {
    const out = new Map<string, Set<number>>();
    for (const [id, idx] of this.pointSelection) if (this.selection.has(id) && idx.size) out.set(id, idx);
    return out;
  }

  /** Delete the selected points if there are any, otherwise the selected items. */
  deleteSelected(): boolean {
    const points = this.selectedPoints();
    if (points.size) {
      this.pointSelection.clear();
      this.apply('Delete points', (s) => removePoints(s, points), true);
      return true;
    }
    const ids = new Set(this.selection);
    if (ids.size === 0) return false;
    this.selection.clear();
    this.pointSelection.clear();
    this.edit('Delete', (s) => removeItems(s, ids));
    return true;
  }

  /** Paste copies of `items` (with fresh ids) onto the active layer and select them. */
  paste(items: Item[], dx: number, dy: number): void {
    if (items.length === 0) return;
    const copies = items.map((it) => translateItem(cloneItem(it), dx, dy));
    const target = this.activeLayer;
    this.selection = new Set(copies.map((c) => c.id));
    this.pointSelection.clear();
    this.edit('Paste', (s) => mapLayer(s, target.id, (l) => ({ ...l, items: [...l.items, ...copies] })));
  }
}
