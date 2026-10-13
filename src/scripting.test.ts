import { afterEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from './model';
import { createDeck, DEFAULT_SCRIPTS, runScript, type ScriptDef } from './scripting';

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

  it('traces a two-colour image into a new layer, filling each region', async () => {
    const fills: string[] = [];
    const stubCtx = {
      fillStyle: '',
      setTransform: () => {},
      fill: () => fills.push(stubCtx.fillStyle),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => stubCtx }) });
    vi.stubGlobal('Path2D', class {
      constructor(public d: string) {}
    });

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
    const setCalls: [string, unknown][] = [];
    const logs: string[] = [];
    let n = 0;
    const deck = {
      getImageData: () => ({ width: size, height: size, data }),
      addLayer: (name: string) => {
        addedNames.push(name);
        return `layer-${++n}`;
      },
      setImageData: (id: string, img: unknown) => setCalls.push([id, img]),
      log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
    };

    await new AsyncFunction('deck', code)(deck);

    expect(addedNames.length).toBeGreaterThanOrEqual(2);
    expect(setCalls.map(([id]) => id)).toEqual(addedNames.map((_, i) => `layer-${i + 1}`));
    expect(addedNames.every((name) => /^Trace (silhouette )?#[0-9a-f]{6}$/.test(name))).toBe(true);
    expect(logs[0]).toMatch(/^Trace: \d+ colours/);
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const colours = fills.map(rgb);
    expect(colours.some(([r, g, b]) => r > 180 && g < 80 && b < 80)).toBe(true);
    expect(colours.some(([r, g, b]) => b > 180 && r < 80 && g < 80)).toBe(true);
  });
});
