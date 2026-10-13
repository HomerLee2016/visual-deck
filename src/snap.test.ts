import { describe, expect, it } from 'vitest';
import { snapBox, snapOffset } from './snap';

describe('snapping', () => {
  it('snaps a candidate to the nearest grid line within tolerance', () => {
    expect(snapOffset([21], [], 10, 2)).toBeCloseTo(-1); // 21 -> 20
    expect(snapOffset([26], [], 10, 2)).toBe(0); // 26 -> 30 is too far to snap
    expect(snapOffset([26], [], 10, 5)).toBeCloseTo(4);
  });

  it('snaps to guides as well as the grid, nearest first', () => {
    expect(snapOffset([33], [35], 10, 5)).toBeCloseTo(2); // guide at 35 is nearer than grid line 30
    expect(snapOffset([33], [], 10, 5)).toBeCloseTo(-3);
  });

  it('does nothing when the grid is off and no guide is near', () => {
    expect(snapOffset([21], [], null, 2)).toBe(0);
    expect(snapOffset([21], [40], null, 2)).toBe(0);
  });

  it('snaps a box by any of its edges or its centre', () => {
    // Box at x 18..38 (centre 28): the right edge (38) is 2 from a grid line at 40, the left (18) is 2 from 20.
    const d = snapBox({ x: 18, y: 0, w: 20, h: 10 }, { x: [], y: [] }, 10, 2.5);
    expect(d.dx).toBeCloseTo(2);
    expect(d.dy).toBeCloseTo(0);
  });
});
