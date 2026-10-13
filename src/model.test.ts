import { describe, expect, it } from 'vitest';
import { MAX_HISTORY, Workspace, imageItem, mapItems, uid } from './model';
import type { LineItem } from './types';

const mkLine = (): LineItem => ({
  kind: 'line',
  id: uid('item'),
  a: { x: 0, y: 0 },
  b: { x: 5, y: 5 },
  style: { color: '#fff', width: 1 },
});

const labels = (ws: Workspace) => ws.history.map((h) => h.label);

describe('history', () => {
  it('records steps, undoes and redoes', () => {
    const ws = new Workspace('t', 64, 64);
    ws.addItem('Line', mkLine());
    ws.addItem('Line', mkLine());
    expect(labels(ws)).toEqual(['Initial', 'Line', 'Line']);
    expect(ws.activeLayer.items).toHaveLength(2);
    ws.undo();
    expect(ws.activeLayer.items).toHaveLength(1);
    ws.redo();
    expect(ws.activeLayer.items).toHaveLength(2);
  });

  it('drops redo steps after a new edit', () => {
    const ws = new Workspace('t', 64, 64);
    ws.addItem('A', mkLine());
    ws.addItem('B', mkLine());
    ws.jump(1);
    ws.addItem('C', mkLine());
    expect(labels(ws)).toEqual(['Initial', 'A', 'C']);
    expect(ws.canRedo).toBe(false);
  });

  it('does not record a step when nothing changed', () => {
    const ws = new Workspace('t', 64, 64);
    expect(ws.commit('noop')).toBe(false);
    expect(ws.history).toHaveLength(1);
  });

  it('caps the history length', () => {
    const ws = new Workspace('t', 8, 8);
    for (let i = 0; i < MAX_HISTORY + 10; i++) ws.addItem(`s${i}`, mkLine());
    expect(ws.history).toHaveLength(MAX_HISTORY);
    expect(ws.index).toBe(MAX_HISTORY - 1);
  });

  it('stores a thumbnail per step via the thumbnailer', () => {
    const ws = new Workspace('t', 8, 8, () => 'thumb');
    ws.addItem('Line', mkLine());
    expect(ws.history.map((h) => h.thumb)).toEqual(['thumb', 'thumb']);
  });
});

describe('selection and clipboard', () => {
  it('deletes selected items across layers', () => {
    const ws = new Workspace('t', 64, 64);
    const a = mkLine();
    ws.addItem('A', a);
    ws.addLayer('Layer');
    const b = mkLine();
    ws.addItem('B', b);
    ws.selection = new Set([a.id, b.id]);
    expect(ws.deleteSelected()).toBe(true);
    expect(ws.state.layers.flatMap((l) => l.items)).toHaveLength(0);
    ws.undo();
    expect(ws.state.layers.flatMap((l) => l.items)).toHaveLength(2);
  });

  it('pastes copies with new ids, offset, and selects them', () => {
    const ws = new Workspace('t', 64, 64);
    const a = mkLine();
    ws.addItem('A', a);
    ws.paste([a], 10, 10);
    const items = ws.activeLayer.items;
    expect(items).toHaveLength(2);
    expect(items[1].id).not.toBe(a.id);
    expect(items[1]).toMatchObject({ a: { x: 10, y: 10 } });
    expect([...ws.selection]).toEqual([items[1].id]);
  });

  it('lists selected items, optionally only those on visible layers', () => {
    const ws = new Workspace('t', 64, 64);
    const a = mkLine();
    ws.addItem('A', a);
    const hiddenLayer = ws.addLayer('Add');
    const b = mkLine();
    ws.addItem('B', b);
    ws.selection = new Set([a.id, b.id]);
    ws.edit(null, (s) => ({ ...s, layers: s.layers.map((l) => (l.id === hiddenLayer ? { ...l, visible: false } : l)) }));
    expect(ws.selectedItems().map((it) => it.id)).toEqual([a.id, b.id]);
    expect(ws.selectedItems(true).map((it) => it.id)).toEqual([a.id]);
  });

  it('prunes selection when jumping to a state without the item', () => {
    const ws = new Workspace('t', 64, 64);
    const a = mkLine();
    ws.addItem('A', a);
    ws.selection = new Set([a.id]);
    ws.undo();
    expect(ws.selection.size).toBe(0);
  });
});

describe('layers', () => {
  it('toggles visibility as a history step and keeps one layer minimum', () => {
    const ws = new Workspace('t', 8, 8);
    const id = ws.activeLayer.id;
    ws.setLayerVisible(id, false);
    expect(ws.state.layers[0].visible).toBe(false);
    ws.undo();
    expect(ws.state.layers[0].visible).toBe(true);
    ws.removeLayer(id);
    expect(ws.state.layers).toHaveLength(1);
  });

  it('shows and hides all layers as one history step each', () => {
    const ws = new Workspace('t', 8, 8);
    ws.addLayer('Add');
    ws.addLayer('Add');
    const before = ws.history.length;
    ws.setAllLayersVisible(false);
    expect(ws.state.layers.every((l) => !l.visible)).toBe(true);
    expect(ws.history).toHaveLength(before + 1);
    ws.undo();
    expect(ws.state.layers.every((l) => l.visible)).toBe(true);
    ws.setAllLayersVisible(true);
    expect(ws.history).toHaveLength(before + 1);
  });

  it('notifies once per layer edit, after the selection and active layer are reconciled', () => {
    const ws = new Workspace('t', 8, 8);
    const first = ws.activeLayer.id;
    const second = ws.addLayer('Add', 'Second');
    const line = mkLine();
    ws.addItem('Line', line);
    ws.selection = new Set([line.id]);

    const seen: { selection: number; active: string }[] = [];
    ws.subscribe(() => seen.push({ selection: ws.selection.size, active: ws.activeLayer.id }));

    ws.setLayerVisible(second, false);
    expect(seen).toEqual([{ selection: 0, active: second }]);

    seen.length = 0;
    ws.removeLayer(second);
    expect(seen).toEqual([{ selection: 0, active: first }]);
  });

  it('merges a layer into the one below as one undoable step', () => {
    const ws = new Workspace('t', 8, 8);
    const bottom = ws.activeLayer.id;
    const low = mkLine();
    ws.addItem('Low', low, bottom);
    const top = ws.addLayer('Add', 'Top');
    const high = mkLine();
    ws.addItem('High', high, top);

    ws.mergeLayerDown(top);
    expect(ws.state.layers).toHaveLength(1);
    expect(ws.state.layers[0].id).toBe(bottom);
    expect(ws.state.layers[0].items.map((it) => it.id)).toEqual([low.id, high.id]);
    expect(ws.activeLayerId).toBe(bottom);

    ws.undo();
    expect(ws.state.layers).toHaveLength(2);
    expect(ws.state.layers[1].items.map((it) => it.id)).toEqual([high.id]);
  });

  it('does not reveal hidden items when merging', () => {
    const ws = new Workspace('t', 8, 8);
    const top = ws.addLayer('Add', 'Top');
    ws.setLayerVisible(top, false);
    ws.mergeLayerDown(top);
    expect(ws.state.layers[0].visible).toBe(false);
  });

  it('ignores merging the bottom layer', () => {
    const ws = new Workspace('t', 8, 8);
    const bottom = ws.activeLayer.id;
    ws.mergeLayerDown(bottom);
    expect(ws.state.layers).toHaveLength(1);
  });

  it('reorders layers', () => {
    const ws = new Workspace('t', 8, 8);
    const second = ws.addLayer('Add', 'Second');
    ws.moveLayer(second, -1);
    expect(ws.state.layers[0].id).toBe(second);
  });
});

describe('imageItem', () => {
  it('places a bitmap at the origin with a fresh id', () => {
    const canvas = { width: 4, height: 4 } as HTMLCanvasElement;
    const a = imageItem(canvas);
    const b = imageItem(canvas, 3, 5);
    expect(a).toMatchObject({ kind: 'image', x: 0, y: 0, canvas });
    expect(b).toMatchObject({ x: 3, y: 5 });
    expect(a.id).not.toBe(b.id);
  });
});

describe('item helpers', () => {
  it('mapItems only transforms the given ids and keeps others by reference', () => {
    const ws = new Workspace('t', 64, 64);
    const a = mkLine();
    const b = mkLine();
    ws.addItem(null, a);
    ws.addItem(null, b);
    const out = mapItems(ws.state, new Set([a.id]), (it) => ({ ...it, id: 'moved' }));
    expect(out.layers[0].items.map((it) => it.id)).toEqual(['moved', b.id]);
    expect(out.layers[0].items[1]).toBe(b);
  });

  it('renames a layer as a history step', () => {
    const ws = new Workspace('t', 64, 64);
    ws.renameLayer(ws.activeLayerId, 'Sky');
    expect(ws.activeLayer.name).toBe('Sky');
    expect(labels(ws)).toEqual(['Initial', 'Rename layer']);
  });

  it('reports canUndo and drops the oldest step beyond MAX_HISTORY', () => {
    const ws = new Workspace('t', 64, 64);
    expect(ws.canUndo).toBe(false);
    for (let i = 0; i < MAX_HISTORY + 5; i++) ws.addItem(`S${i}`, mkLine());
    expect(ws.history).toHaveLength(MAX_HISTORY);
    expect(ws.canUndo).toBe(true);
    expect(ws.index).toBe(MAX_HISTORY - 1);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const ws = new Workspace('t', 64, 64);
    let n = 0;
    const off = ws.subscribe(() => n++);
    ws.addItem('A', mkLine());
    off();
    ws.addItem('B', mkLine());
    expect(n).toBe(1);
  });
});
