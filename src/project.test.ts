import { describe, expect, it } from 'vitest';
import { Workspace, uid } from './model';
import { parseProject, serializeProject, type ImageCodec } from './project';
import type { LineItem } from './types';

const fakeCanvas = (tag: string) => ({ tag }) as unknown as HTMLCanvasElement;
const codec: ImageCodec = {
  encode: (c) => (c as unknown as { tag: string }).tag,
  decode: async (d) => fakeCanvas(d),
};
const line = (): LineItem => ({ kind: 'line', id: uid('item'), a: { x: 0, y: 0 }, b: { x: 5, y: 5 }, style: { color: '#fff', width: 1 } });

describe('dirty tracking', () => {
  it('is clean when new, dirty after an edit, clean again after save or undo', () => {
    const ws = new Workspace('t', 64, 64);
    expect(ws.dirty).toBe(false);
    ws.addItem('Line', line());
    expect(ws.dirty).toBe(true);
    ws.undo();
    expect(ws.dirty).toBe(false);
    ws.redo();
    ws.markSaved();
    expect(ws.dirty).toBe(false);
    ws.addItem('Line', line());
    expect(ws.dirty).toBe(true);
  });
});

describe('project files', () => {
  it('round-trips layers, images, history and the loaded state is clean', async () => {
    const ws = new Workspace('art', 64, 32);
    ws.addItem('Line', line());
    ws.addLayer('Image layer', 'Pics', [{ kind: 'image', id: uid('item'), x: 3, y: 4, canvas: fakeCanvas('png1') }]);
    ws.setLayerVisible(ws.state.layers[0].id, false);
    ws.undo();
    const text = serializeProject(ws, codec);
    expect(text.match(/png1/g)).toHaveLength(1); // image stored once despite appearing in several steps

    const p = await parseProject(text, codec);
    const copy = new Workspace(p.name, 64, 32);
    copy.restore(p.history, p.index, p.activeLayerId, p.view);
    expect(copy.name).toBe('art');
    expect(copy.history.map((h) => h.label)).toEqual(ws.history.map((h) => h.label));
    expect(copy.index).toBe(ws.index);
    expect(copy.state.layers.map((l) => l.name)).toEqual(['Layer 1', 'Pics']);
    expect(copy.state.layers[1].items[0]).toMatchObject({ kind: 'image', x: 3, y: 4 });
    expect(copy.activeLayerId).toBe(ws.activeLayerId);
    expect(copy.dirty).toBe(false);
    copy.redo();
    expect(copy.state.layers[0].visible).toBe(false);
    expect(copy.dirty).toBe(true);
  });

  it('keeps new ids from colliding with loaded ones', async () => {
    const ws = new Workspace('a', 8, 8);
    const it = { ...line(), id: 'item9999' };
    ws.addItem('Line', it);
    await parseProject(serializeProject(ws, codec), codec);
    expect(Number(uid('item').slice(4))).toBeGreaterThan(9999);
  });

  it('rejects files that are not projects', async () => {
    await expect(parseProject('{"hello":1}', codec)).rejects.toThrow('Not a Visual Deck project');
    await expect(parseProject('nope', codec)).rejects.toThrow('Not a Visual Deck project');
  });
});
