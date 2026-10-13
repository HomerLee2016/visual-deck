import { translateItem } from './geometry';
import type { DocState, HistoryEntry, ImageItem, Item, Layer, Style } from './types';
import { INITIAL_VIEW, type View } from './view';

let counter = 0;
export const uid = (prefix: string) => `${prefix}${++counter}`;

export type Thumbnailer = (state: DocState) => string | null;

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

export function removeItems(s: DocState, ids: ReadonlySet<string>): DocState {
  return { ...s, layers: s.layers.map((l) => ({ ...l, items: l.items.filter((it) => !ids.has(it.id)) })) };
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
  history: HistoryEntry[];
  index = 0;
  view: View = INITIAL_VIEW;
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

  setLayerVisible(id: string, visible: boolean): void {
    const l = this.state.layers.find((x) => x.id === id);
    if (!l || l.visible === visible) return;
    this.apply(`${visible ? 'Show' : 'Hide'} ${l.name}`, (s) => mapLayer(s, id, (x) => ({ ...x, visible })), true);
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

  deleteSelected(): boolean {
    const ids = new Set(this.selection);
    if (ids.size === 0) return false;
    this.selection.clear();
    this.edit('Delete', (s) => removeItems(s, ids));
    return true;
  }

  /** Paste copies of `items` (with fresh ids) onto the active layer and select them. */
  paste(items: Item[], dx: number, dy: number): void {
    if (items.length === 0) return;
    const copies = items.map((it) => translateItem(cloneItem(it), dx, dy));
    const target = this.activeLayer;
    this.selection = new Set(copies.map((c) => c.id));
    this.edit('Paste', (s) => mapLayer(s, target.id, (l) => ({ ...l, items: [...l.items, ...copies] })));
  }
}
