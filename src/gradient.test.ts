import { describe, expect, it } from 'vitest';
import { defaultGradient, gradientHandles, moveGradientHandle } from './gradient';
import type { Gradient } from './types';

const stops = [
  { offset: 0, color: '#000' },
  { offset: 1, color: '#fff' },
];

describe('gradients', () => {
  it('spans a linear gradient across the middle of its box', () => {
    expect(defaultGradient('linear', { x: 0, y: 0, w: 10, h: 4 }, stops)).toMatchObject({ x1: 0, y1: 2, x2: 10, y2: 2 });
  });

  it('centres a radial gradient in its box, reaching the longer half-side', () => {
    expect(defaultGradient('radial', { x: 0, y: 0, w: 10, h: 4 }, stops)).toMatchObject({ cx: 5, cy: 2, r: 5, fx: 5, fy: 2 });
  });

  it('exposes start and end handles for linear, centre and rim for radial', () => {
    const lin: Gradient = defaultGradient('linear', { x: 0, y: 0, w: 10, h: 4 }, stops);
    expect(gradientHandles(lin).map((h) => h.id)).toEqual(['start', 'end']);
    const rad: Gradient = defaultGradient('radial', { x: 0, y: 0, w: 10, h: 4 }, stops);
    expect(gradientHandles(rad)).toEqual([
      { id: 'centre', p: { x: 5, y: 2 } },
      { id: 'radius', p: { x: 10, y: 2 } },
    ]);
  });

  it('moves linear endpoints independently', () => {
    const lin = defaultGradient('linear', { x: 0, y: 0, w: 10, h: 4 }, stops);
    expect(moveGradientHandle(lin, 'end', { x: 20, y: 7 })).toMatchObject({ x1: 0, y1: 2, x2: 20, y2: 7 });
  });

  it('carries the focal point with the centre, and sets the radius from the rim handle', () => {
    const rad = defaultGradient('radial', { x: 0, y: 0, w: 10, h: 10 }, stops);
    const moved = moveGradientHandle(rad, 'centre', { x: 7, y: 5 });
    expect(moved).toMatchObject({ cx: 7, cy: 5, fx: 7, fy: 5, r: 5 });
    expect(moveGradientHandle(moved, 'radius', { x: 7, y: 9 })).toMatchObject({ r: 4 });
  });
});
