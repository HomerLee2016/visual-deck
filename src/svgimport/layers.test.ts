import { describe, expect, it } from 'vitest';
import type { Item } from '../types';
import { layersOf, type LayerPart } from './index';

const rect = (id: string): Item => ({ kind: 'rect', id, x: 0, y: 0, w: 1, h: 1, r: 0, style: { color: '#000000', width: 1 } });
const part = (path: boolean, name: string, id: string): LayerPart => ({ path, name, items: [rect(id)] });

describe('svg import layers', () => {
  it('gives each path its own layer, named by id or by number', () => {
    const layers = layersOf([part(true, 'sky', 'a'), part(true, '', 'b'), part(true, '', 'c')]);
    expect(layers.map((l) => l.name)).toEqual(['sky', 'Path 1', 'Path 2']);
    expect(layers.map((l) => l.items.map((i) => i.id))).toEqual([['a'], ['b'], ['c']]);
  });

  it('keeps other shapes in paint order around the path layers', () => {
    const layers = layersOf([part(false, '', 'r1'), part(true, '', 'p1'), part(false, '', 'r2'), part(false, '', 'r3'), part(true, '', 'p2')]);
    expect(layers.map((l) => [l.name, l.items.map((i) => i.id)])).toEqual([
      ['Imported', ['r1']],
      ['Path 1', ['p1']],
      ['Imported', ['r2', 'r3']],
      ['Path 2', ['p2']],
    ]);
  });

  it('returns one empty layer for an empty document', () => {
    const layers = layersOf([]);
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('Imported');
    expect(layers[0].items).toEqual([]);
  });
});
