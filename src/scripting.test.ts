import { afterEach, describe, expect, it, vi } from 'vitest';
import { Workspace } from './model';
import { createDeck, runScript, type ScriptDef } from './scripting';

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
