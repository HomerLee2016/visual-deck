import { describe, expect, it } from 'vitest';
import { resolveDefs, shareStyle, unshareStyle, updateDefinition } from './shared';
import type { DocState, LineItem } from './types';

const line = (id: string, style: LineItem['style']): LineItem => ({ kind: 'line', id, a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, style });
const doc = (...items: LineItem[]): DocState => ({ width: 10, height: 10, layers: [{ id: 'l', name: 'L', visible: true, items }] });
const ids = (...n: string[]) => new Set(n);
const styleOf = (s: DocState, id: string) => (s.layers[0].items.find((it) => it.id === id) as LineItem).style;

describe('shared definitions', () => {
  it('shares a fill colour and resolves back to the same paint', () => {
    const s = doc(line('a', { color: '#000', width: 1, fill: '#ff0000' }), line('b', { color: '#000', width: 1, fill: '#ff0000' }));
    const shared = shareStyle(s, ids('a', 'b'), 'fill');
    expect(styleOf(shared, 'a').fillRef).toBe('d1');
    expect(styleOf(shared, 'a').fill).toBeUndefined();
    expect(shared.defs).toEqual({ d1: { kind: 'color', color: '#ff0000' } });
    expect(styleOf(resolveDefs(shared), 'b').fill).toBe('#ff0000');
  });

  it('editing a definition changes every item that uses it', () => {
    const shared = shareStyle(doc(line('a', { color: '#000', width: 1, fill: '#ff0000' }), line('b', { color: '#000', width: 1, fill: '#ff0000' })), ids('a', 'b'), 'fill');
    const edited = updateDefinition(shared, 'd1', { kind: 'color', color: '#00ff00' });
    expect(styleOf(resolveDefs(edited), 'a').fill).toBe('#00ff00');
    expect(styleOf(resolveDefs(edited), 'b').fill).toBe('#00ff00');
  });

  it('shares a gradient stroke', () => {
    const grad = { type: 'linear' as const, x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ offset: 0, color: '#000' }, { offset: 1, color: '#fff' }] };
    const shared = shareStyle(doc(line('a', { color: '#000', width: 1, strokeGradient: grad })), ids('a'), 'stroke');
    expect(shared.defs?.d1).toEqual({ kind: 'gradient', gradient: grad });
    expect(styleOf(resolveDefs(shared), 'a').strokeGradient).toEqual(grad);
  });

  it('unshares back to plain values', () => {
    const shared = shareStyle(doc(line('a', { color: '#000', width: 1, fill: '#ff0000' })), ids('a'), 'fill');
    const plain = unshareStyle(shared, ids('a'));
    expect(styleOf(plain, 'a').fillRef).toBeUndefined();
    expect(styleOf(plain, 'a').fill).toBe('#ff0000');
  });

  it('leaves a document with no shared definitions as it is', () => {
    const s = doc(line('a', { color: '#000', width: 1 }));
    expect(resolveDefs(s)).toBe(s);
  });
});
