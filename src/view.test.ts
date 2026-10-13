import { describe, expect, it } from 'vitest';
import { INITIAL_VIEW, MAX_ZOOM, MIN_ZOOM, fitView, toDoc, toScreen, zoomAround } from './view';

describe('fitView', () => {
  it('centers a document that fits and caps the zoom for small ones', () => {
    const v = fitView({ w: 1000, h: 800 }, { w: 100, h: 100 });
    expect(v).toMatchObject({ zoom: 4, fitted: true });
    expect(v.panX).toBeCloseTo((1000 - 400) / 2);
    expect(v.panY).toBeCloseTo((800 - 400) / 2);
  });

  it('shrinks a large document to fit inside the margin', () => {
    const v = fitView({ w: 548, h: 1000 }, { w: 1000, h: 1000 });
    expect(v.zoom).toBeCloseTo(0.5);
    expect(v.panX).toBeCloseTo(24);
  });

  it('never goes below the minimum zoom', () => {
    expect(fitView({ w: 100, h: 100 }, { w: 1e6, h: 1e6 }).zoom).toBe(MIN_ZOOM);
  });
});

describe('zoomAround', () => {
  it('keeps the document point under the cursor fixed', () => {
    const view = { zoom: 2, panX: 30, panY: -10, fitted: true };
    const cursor = { x: 120, y: 80 };
    const before = toDoc(view, cursor);
    const after = toDoc(zoomAround(view, 5, cursor), cursor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps the zoom and keeps the other fields', () => {
    expect(zoomAround(INITIAL_VIEW, 1e9, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    expect(zoomAround(INITIAL_VIEW, 0, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM);
    expect(zoomAround({ ...INITIAL_VIEW, fitted: true }, 2, { x: 0, y: 0 }).fitted).toBe(true);
  });
});

describe('toDoc / toScreen', () => {
  it('are inverses', () => {
    const view = { zoom: 3, panX: 17, panY: 9, fitted: true };
    const p = { x: 12.5, y: -4 };
    const back = toDoc(view, toScreen(view, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});
