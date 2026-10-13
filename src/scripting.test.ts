import { afterEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from './model';
import type { Style } from './types';
import { createDeck, DEFAULT_SCRIPTS, loadScripts, runScript, saveScripts, type PathSub, type ScriptDef } from './scripting';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;

const script = (code: string): ScriptDef => ({ id: 'test', name: 'Test', code });
const newWs = () => new Workspace('t', 64, 64);

afterEach(() => vi.restoreAllMocks());

describe('createDeck', () => {
  it('adds shapes to the active layer by default, with default style', () => {
    const ws = newWs();
    const deck = createDeck(ws, () => {});
    deck.addLine(0, 0, 10, 10);
    deck.addArc(0, 0, 10, 0, 5, -5);
    deck.addCurve(0, 0, 10, 0, 2, 5, 8, 5, { color: '#fff' });
    expect(ws.activeLayer.items.map((it) => it.kind)).toEqual(['line', 'arc', 'curve']);
    expect(ws.activeLayer.items[0]).toMatchObject({ style: { color: '#ffcc00', width: 2 } });
    expect(ws.activeLayer.items[2]).toMatchObject({ style: { color: '#fff', width: 2 } });
  });

  it('adds one path item with its subpaths, nodes and handles kept as given', () => {
    const ws = newWs();
    const deck = createDeck(ws, () => {});
    deck.addPath(
      [{ nodes: [{ x: 0, y: 0, out: { x: 1, y: 0 } }, { x: 4, y: 0, in: { x: 3, y: 1 } }, { x: 4, y: 4 }], closed: true }],
      { color: '#123456', width: 0, fill: '#123456' },
    );
    const item = ws.activeLayer.items[0];
    expect(item).toMatchObject({ kind: 'path', style: { color: '#123456', width: 0, fill: '#123456' } });
    expect(item).toMatchObject({ subs: [{ closed: true, nodes: [
      { p: { x: 0, y: 0 }, out: { x: 1, y: 0 } },
      { p: { x: 4, y: 0 }, in: { x: 3, y: 1 } },
      { p: { x: 4, y: 4 } },
    ] }] });
    expect(item).not.toHaveProperty('subs.0.nodes.2.in');
  });

  it('targets the layer id it is given', () => {
    const ws = newWs();
    const deck = createDeck(ws, () => {});
    const first = ws.activeLayerId;
    const other = deck.addLayer('Grid');
    deck.addLine(0, 0, 1, 1, undefined, first);
    expect(ws.state.layers.find((l) => l.id === first)!.items).toHaveLength(1);
    expect(ws.state.layers.find((l) => l.id === other)!.items).toHaveLength(0);
  });

  it('exposes the selection and clears layers', () => {
    const ws = newWs();
    const deck = createDeck(ws, () => {});
    deck.addLine(0, 0, 1, 1);
    const [item] = ws.activeLayer.items;
    ws.selection = new Set([item.id]);
    expect(deck.selection).toEqual([{ id: item.id, kind: 'line' }]);
    deck.clearLayer();
    expect(ws.activeLayer.items).toHaveLength(0);
  });

  it('routes deck.log arguments to the log callback', () => {
    const logs: string[] = [];
    createDeck(newWs(), (m) => logs.push(m)).log('size', 64);
    expect(logs).toEqual(['size 64']);
  });
});

describe('runScript', () => {
  it('records one history step named after the script', async () => {
    const ws = newWs();
    const logs: string[] = [];
    await runScript(script('deck.addLine(0, 0, 5, 5); deck.addLine(5, 5, 9, 9);'), ws, (m) => logs.push(m));
    expect(ws.history.map((h) => h.label)).toEqual(['Initial', 'Test']);
    expect(ws.activeLayer.items).toHaveLength(2);
    expect(logs).toEqual(['Test: done']);
  });

  it('records no step when the script changes nothing', async () => {
    const ws = newWs();
    const logs: string[] = [];
    await runScript(script('const x = 1 + 1;'), ws, (m) => logs.push(m));
    expect(ws.history).toHaveLength(1);
    expect(logs).toEqual(['Test: done (no changes)']);
  });

  it('rolls back partial edits when the script throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ws = newWs();
    const logs: string[] = [];
    await runScript(script("deck.addLine(0, 0, 5, 5); throw new Error('boom');"), ws, (m) => logs.push(m));
    expect(ws.activeLayer.items).toHaveLength(0);
    expect(ws.history).toHaveLength(1);
    expect(logs).toEqual(['Test failed: boom']);
  });
});

describe('builtin Trace to SVG', () => {
  const code = DEFAULT_SCRIPTS.find((s) => s.id === 'builtin-trace')!.code;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('traces a two-colour image into one editable path per colour', async () => {

    const size = 8;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const left = x < size / 2;
        data.set(left ? [230, 20, 20, 255] : [20, 20, 230, 255], i);
      }
    }
    const addedNames: string[] = [];
    const paths: { layerId: string; subs: PathSub[]; style: Partial<Style> }[] = [];
    const logs: string[] = [];
    let n = 0;
    const deck = {
      getImageData: () => ({ width: size, height: size, data }),
      addLayer: (name: string) => {
        addedNames.push(name);
        return `layer-${++n}`;
      },
      addPath: (subs: PathSub[], style: Partial<Style>, layerId: string) => paths.push({ layerId, subs, style }),
      log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
    };

    await new AsyncFunction('deck', code)(deck);

    expect(addedNames.length).toBeGreaterThanOrEqual(2);
    expect(paths.map((p) => p.layerId)).toEqual(addedNames.map((_, i) => `layer-${i + 1}`));
    expect(addedNames.every((name) => /^Trace (silhouette )?#[0-9a-f]{6}$/.test(name))).toBe(true);
    expect(logs[0]).toMatch(/^Trace: \d+ colours/);
    // Fill-only: no stroke, and the fill is the colour of the layer.
    expect(paths.every((p) => p.style.width === 0 && p.style.color === p.style.fill)).toBe(true);
    expect(paths.every((p) => p.subs.length > 0 && p.subs.every((s) => s.closed && s.nodes.length >= 3))).toBe(true);
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const colours = paths.map((p) => rgb(p.style.fill!));
    expect(colours.some(([r, g, b]) => r > 180 && g < 80 && b < 80)).toBe(true);
    expect(colours.some(([r, g, b]) => b > 180 && r < 80 && g < 80)).toBe(true);
  });
});

describe('deck getters', () => {
  it('exposes size, layers, active layer and selection', () => {
    const ws = newWs();
    const deck = createDeck(ws, () => {});
    deck.addLine(0, 0, 1, 1);
    const id = ws.activeLayer.items[0].id;
    ws.selection = new Set([id]);
    expect(deck.width).toBe(64);
    expect(deck.height).toBe(64);
    expect(deck.layers).toEqual([{ id: ws.activeLayerId, name: 'Layer 1', visible: true, itemCount: 1 }]);
    expect(deck.activeLayerId).toBe(ws.activeLayerId);
    expect(deck.selection).toEqual([{ id, kind: 'line' }]);
  });

  it('clearLayer and log work', () => {
    const ws = newWs();
    const msgs: string[] = [];
    const deck = createDeck(ws, (m) => msgs.push(m));
    deck.addLine(0, 0, 1, 1);
    deck.clearLayer();
    expect(ws.activeLayer.items).toHaveLength(0);
    deck.log('a', 1);
    expect(msgs).toEqual(['a 1']);
  });
});

describe('script storage', () => {
  const stubStorage = (store: Record<string, string>) =>
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => void (store[k] = v),
    });
  afterEach(() => vi.unstubAllGlobals());

  it('falls back to the defaults when nothing or garbage is stored', () => {
    stubStorage({});
    expect(loadScripts().map((s) => s.id)).toEqual(DEFAULT_SCRIPTS.map((s) => s.id));
    stubStorage({ 'visual-deck.scripts.v1': 'not json' });
    expect(loadScripts()).toHaveLength(DEFAULT_SCRIPTS.length);
  });

  it('round-trips saved scripts', () => {
    stubStorage({});
    const list = [{ id: 'x', name: 'X', code: '1' }];
    saveScripts(list);
    expect(loadScripts()).toEqual(list);
  });

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    expect(() => saveScripts([])).not.toThrow();
    expect(loadScripts()).toHaveLength(DEFAULT_SCRIPTS.length);
  });
});

describe('setImageData with a mask', () => {
  it('refuses a bitmap that does not match the masked document size', () => {
    const ws = newWs();
    ws.setMask({ width: 64, height: 64, data: new Uint8Array(64 * 64) });
    const deck = createDeck(ws, () => {});
    const small = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) } as ImageData;
    expect(() => deck.setImageData(ws.activeLayerId, small)).toThrow(/mask is 64×64/);
  });

  it('ignores a mask that no longer fits the document', () => {
    const ws = newWs();
    ws.setMask({ width: 10, height: 10, data: new Uint8Array(100) });
    expect(ws.activeMask()).toBeNull();
    ws.setMask({ width: 64, height: 64, data: new Uint8Array(64 * 64) });
    expect(ws.activeMask()).not.toBeNull();
  });
});
