import { describe, expect, it } from 'vitest';
import { MAX_HISTORY, Workspace, uid } from './model';
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

  it('reorders layers', () => {
    const ws = new Workspace('t', 8, 8);
    const second = ws.addLayer('Add', 'Second');
    ws.moveLayer(second, -1);
    expect(ws.state.layers[0].id).toBe(second);
  });
});
