import { describe, expect, it } from 'vitest';
import { angleOfMatrix, handlesFor, hitHandle, rotateMatrix, scaleMatrix } from './handles';
import { apply } from './matrix';

const box = { x: 0, y: 0, w: 10, h: 10 };

describe('selection handles', () => {
  it('places eight scale handles on the box and the rotate knob above it', () => {
    const hs = handlesFor(box, 2);
    expect(hs.find((h) => h.id === 'se')).toMatchObject({ x: 10, y: 10 });
    expect(hs.find((h) => h.id === 'w')).toMatchObject({ x: 0, y: 5 });
    expect(hs.find((h) => h.id === 'rot')).toMatchObject({ x: 5, y: -12 }); // 24 screen px at zoom 2
  });

  it('hits the handle nearest the pointer within tolerance', () => {
    const hs = handlesFor(box, 1);
    expect(hitHandle(hs, { x: 10.5, y: 9.5 }, 1)).toBe('se');
    expect(hitHandle(hs, { x: 5, y: 5 }, 1)).toBeNull();
  });

  it('scales from the opposite corner when a corner is dragged', () => {
    const m = scaleMatrix(box, 'se', { x: 20, y: 20 });
    expect(apply(m, { x: 10, y: 10 })).toEqual({ x: 20, y: 20 });
    expect(apply(m, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 }); // the fixed corner
  });

  it('scales one axis when an edge is dragged', () => {
    const m = scaleMatrix(box, 'e', { x: 15, y: 99 });
    expect(apply(m, { x: 10, y: 5 })).toEqual({ x: 15, y: 5 });
    expect(apply(m, { x: 0, y: 10 })).toEqual({ x: 0, y: 10 });
  });

  it('keeps proportions for a corner with Shift', () => {
    const m = scaleMatrix(box, 'se', { x: 20, y: 15 }, true);
    expect(apply(m, { x: 10, y: 10 })).toEqual({ x: 20, y: 20 });
  });

  it('never collapses to a flat transform', () => {
    const m = scaleMatrix(box, 'e', { x: 0, y: 0 });
    expect(m[0]).toBeCloseTo(0.01);
  });

  it('rotates about a centre', () => {
    const m = rotateMatrix({ x: 0, y: 0 }, Math.PI / 2);
    const p = apply(m, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
    expect(angleOfMatrix(m)).toBeCloseTo(Math.PI / 2);
  });
});
