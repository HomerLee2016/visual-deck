import { describe, expect, it } from 'vitest';
import { buildShape, hitTest, itemBounds, translateItem } from '../geometry';
import { DEFAULT_SHAPE_PARAMS } from './types';
import { rectType, squareCorner } from './rect';
import { toSvg } from '../svg';
import type { RectItem } from '../types';

const style = { color: '#fff', width: 2 };
const rect = (over: Partial<RectItem> = {}): RectItem => ({ kind: 'rect', id: 'r', x: 0, y: 0, w: 20, h: 10, r: 0, style, ...over });

describe('rect', () => {
  it('builds from any two opposite corners, normalised to top-left', () => {
    const it = buildShape('rect', [{ x: 30, y: 5 }, { x: 10, y: 25 }], style, 'r', DEFAULT_SHAPE_PARAMS);
    expect(it).toMatchObject({ kind: 'rect', x: 10, y: 5, w: 20, h: 20, r: 0 });
  });

  it('takes its corner radius from the creation params', () => {
    const it = buildShape('rect', [{ x: 0, y: 0 }, { x: 10, y: 10 }], style, 'r', { ...DEFAULT_SHAPE_PARAMS, radius: 3 });
    expect(it).toMatchObject({ r: 3 });
  });

  it('waits for two points', () => {
    expect(buildShape('rect', [{ x: 0, y: 0 }], style, 'r', DEFAULT_SHAPE_PARAMS)).toBeNull();
  });

  it('hit-tests its outline bounds and bounds include stroke width', () => {
    expect(hitTest(rect(), { x: 0, y: 5 }, 0.5)).toBe(true);
    expect(hitTest(rect(), { x: 10, y: 5 }, 0.5)).toBe(false); // filled-looking interior is not a stroke hit
    expect(itemBounds(rect())).toEqual({ x: -1, y: -1, w: 22, h: 12 });
  });

  it('follows the rounded corners when hit-testing', () => {
    const rounded = rect({ r: 5 });
    // The sharp corner (0, 0) is cut away by the radius, so it is not on the outline.
    expect(hitTest(rounded, { x: 0, y: 0 }, 0.5)).toBe(false);
    expect(hitTest(rounded, { x: 5, y: 0 }, 0.5)).toBe(true);
  });

  it('never rounds more than half the shorter side', () => {
    const svg = toSvg({ width: 40, height: 40, layers: [{ id: 'l', name: 'L', visible: true, items: [rect({ r: 99 })] }] });
    expect(svg).toContain('A5 5 0 0 1 20 5');
  });

  it('moves its top-left corner when translated', () => {
    const moved = translateItem(rect(), 5, 7) as RectItem;
    expect(moved).toMatchObject({ x: 5, y: 7, w: 20, h: 10 });
  });

  it('exports a closed rounded path', () => {
    const svg = toSvg({ width: 40, height: 40, layers: [{ id: 'l', name: 'L', visible: true, items: [rect({ r: 2 })] }] });
    expect(svg).toContain('<path d="M2 0 H18 A2 2 0 0 1 20 2 V8 A2 2 0 0 1 18 10 H2 A2 2 0 0 1 0 8 V2 A2 2 0 0 1 2 0 Z"');
  });

  it('constrains the second corner to a square, keeping the drag direction', () => {
    expect(squareCorner({ x: 0, y: 0 }, { x: 10, y: 4 })).toEqual({ x: 10, y: 10 });
    expect(squareCorner({ x: 10, y: 10 }, { x: 4, y: 9 })).toEqual({ x: 4, y: 4 });
  });

  it('has its four corners as handles', () => {
    expect(rectType.handles(rect())).toHaveLength(4);
  });
});
