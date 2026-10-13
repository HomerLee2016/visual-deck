import { describe, expect, it } from 'vitest';
import { hitTest, itemBounds, translateItem } from '../geometry';
import { toSvg } from '../svg';
import type { PathItem } from '../types';

const style = { color: '#fff', width: 0 };
const path = (over: Partial<PathItem> = {}): PathItem => ({
  kind: 'path',
  id: 'p',
  subs: [
    {
      nodes: [{ p: { x: 0, y: 0 } }, { p: { x: 10, y: 0 } }, { p: { x: 10, y: 10 } }],
      closed: true,
    },
  ],
  style,
  ...over,
});

describe('path', () => {
  it('hit-tests its segments, including the closing one', () => {
    expect(hitTest(path(), { x: 5, y: 0 }, 0.5)).toBe(true);
    expect(hitTest(path(), { x: 5, y: 5 }, 0.5)).toBe(true); // closing segment (10,10)->(0,0)
    expect(hitTest(path(), { x: 0, y: 5 }, 0.5)).toBe(false);
    expect(hitTest(path(), { x: 2, y: 8 }, 0.5)).toBe(false);
  });

  it('does not connect separate subpaths across the gap', () => {
    const two = path({
      subs: [
        { nodes: [{ p: { x: 0, y: 0 } }, { p: { x: 10, y: 0 } }], closed: false },
        { nodes: [{ p: { x: 0, y: 50 } }, { p: { x: 10, y: 50 } }], closed: false },
      ],
    });
    expect(hitTest(two, { x: 5, y: 25 }, 0.5)).toBe(false);
    expect(hitTest(two, { x: 5, y: 50 }, 0.5)).toBe(true);
    expect(itemBounds(two)).toEqual({ x: 0, y: 0, w: 10, h: 50 });
  });

  it('follows a curved segment, not its control points', () => {
    const curve = path({
      subs: [
        {
          nodes: [
            { p: { x: 0, y: 0 }, out: { x: 0, y: 20 } },
            { p: { x: 20, y: 0 }, in: { x: 20, y: 20 } },
          ],
          closed: false,
        },
      ],
    });
    // The curve's midpoint is at y = 15, well away from the chord y = 0 and the control points.
    expect(hitTest(curve, { x: 10, y: 15 }, 0.5)).toBe(true);
    expect(hitTest(curve, { x: 10, y: 0 }, 0.5)).toBe(false);
  });

  it('writes straight and curved segments as path data', () => {
    const curve = path({
      subs: [
        {
          nodes: [
            { p: { x: 0, y: 0 }, out: { x: 1, y: 2 } },
            { p: { x: 10, y: 0 } },
          ],
          closed: true,
        },
      ],
    });
    const svg = toSvg({ width: 10, height: 10, layers: [{ id: 'l', name: 'L', visible: true, items: [curve] }] });
    // The curved first segment, then the straight closing segment back to the start.
    expect(svg).toContain('d="M0 0 C1 2 10 0 10 0 L0 0 Z"');
  });

  it('moves handles together with their nodes', () => {
    const it = path({
      subs: [{ nodes: [{ p: { x: 0, y: 0 }, out: { x: 5, y: 5 } }, { p: { x: 10, y: 0 } }], closed: false }],
    });
    const moved = translateItem(it, 3, 4) as PathItem;
    expect(moved.subs[0].nodes[0]).toEqual({ p: { x: 3, y: 4 }, out: { x: 8, y: 9 } });
  });
});
