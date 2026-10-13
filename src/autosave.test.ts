import { describe, expect, it } from 'vitest';
import { Workspace, uid } from './model';
import { parseSession, serializeSession } from './autosave';
import type { ImageCodec } from './project';
import type { LineItem } from './types';

const fakeCanvas = (tag: string) => ({ tag }) as unknown as HTMLCanvasElement;
const codec: ImageCodec = {
  encode: (c) => (c as unknown as { tag: string }).tag,
  decode: async (d) => fakeCanvas(d),
};
const line = (): LineItem => ({ kind: 'line', id: uid('item'), a: { x: 0, y: 0 }, b: { x: 5, y: 5 }, style: { color: '#fff', width: 1 } });

describe('autosaved session', () => {
  it('keeps every tab, its name and the active tab', async () => {
    const a = new Workspace('first', 64, 32);
    const b = new Workspace('second', 16, 16);
    b.addLayer('Image layer', 'Pics', [{ kind: 'image', id: uid('item'), x: 1, y: 2, canvas: fakeCanvas('png') }]);
    const { projects, active } = await parseSession(serializeSession([a, b], 1, codec), codec);
    expect(projects.map((p) => p.name)).toEqual(['first', 'second']);
    expect(active).toBe(1);
    expect(projects[1].history[projects[1].index].state.layers[1].items[0]).toMatchObject({ kind: 'image', x: 1, y: 2 });
  });

  it('keeps the undo history and the current position', async () => {
    const ws = new Workspace('art', 64, 32);
    ws.edit('Add line', (s) => ({ ...s, layers: [{ ...s.layers[0], items: [line()] }] }));
    ws.edit('Add line', (s) => ({ ...s, layers: [{ ...s.layers[0], items: [line(), line()] }] }));
    ws.undo();
    const { projects } = await parseSession(serializeSession([ws], 0, codec), codec);
    expect(projects[0].history.length).toBe(3);
    expect(projects[0].index).toBe(1);
  });

  it('clamps an out-of-range active tab', async () => {
    const text = serializeSession([new Workspace('only', 8, 8)], 0, codec);
    const { active } = await parseSession(text.replace('"active":0', '"active":9'), codec);
    expect(active).toBe(0);
  });

  it('rejects text that is not an autosaved session', async () => {
    await expect(parseSession('{"format":"visual-deck","version":1,"history":[]}', codec)).rejects.toThrow('Not an autosaved session');
    await expect(parseSession('not json', codec)).rejects.toThrow('Not an autosaved session');
  });
});
