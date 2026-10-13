import { describe, expect, it } from 'vitest';
import { toSvg } from '../svg';
import type { DocState, Gradient, LineItem } from '../types';

const grad: Gradient = {
  type: 'linear',
  x1: 0,
  y1: 0,
  x2: 10,
  y2: 0,
  stops: [
    { offset: 0, color: '#ff0000' },
    { offset: 1, color: '#0000ff' },
  ],
};
const doc = (items: LineItem[]): DocState => ({ width: 20, height: 20, layers: [{ id: 'l', name: 'L', visible: true, items }] });
const shape = (style: LineItem['style']): LineItem => ({ kind: 'line', id: 'a', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, style });

describe('gradient svg', () => {
  it('writes a linear gradient definition and references it from the fill', () => {
    const svg = toSvg(doc([shape({ color: '#fff', width: 2, fillGradient: grad })]));
    expect(svg).toContain('<defs><linearGradient id="g1" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="10" y2="0">');
    expect(svg).toContain('<stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/>');
    expect(svg).toContain('fill="url(#g1)"');
  });

  it('references a gradient stroke from the stroke attribute', () => {
    const svg = toSvg(doc([shape({ color: '#fff', width: 2, strokeGradient: grad })]));
    expect(svg).toContain('stroke="url(#g1)"');
    expect(svg).toContain('fill="none"');
  });

  it('defines a gradient once even when several items use it', () => {
    const svg = toSvg(doc([shape({ color: '#fff', width: 2, fillGradient: grad }), shape({ color: '#fff', width: 2, fillGradient: grad })]));
    expect(svg.match(/<linearGradient/g)).toHaveLength(1);
    expect(svg.match(/url\(#g1\)/g)).toHaveLength(2);
  });

  it('writes a radial gradient with its focal point', () => {
    const radial: Gradient = { type: 'radial', cx: 5, cy: 5, r: 4, fx: 3, fy: 4, stops: [{ offset: 0, color: '#fff' }, { offset: 1, color: '#000' }] };
    const svg = toSvg(doc([shape({ color: '#fff', width: 1, fillGradient: radial })]));
    expect(svg).toContain('<radialGradient id="g1" gradientUnits="userSpaceOnUse" cx="5" cy="5" r="4" fx="3" fy="4">');
  });

  it('leaves the defs out when nothing uses a gradient', () => {
    expect(toSvg(doc([shape({ color: '#fff', width: 2 })]))).not.toContain('<defs>');
  });
});

describe('effects svg', () => {
  it('writes a blur and drop shadow filter and references it', () => {
    const svg = toSvg(doc([shape({ color: '#fff', width: 2, blur: 3, shadow: { dx: 2, dy: 4, blur: 1, color: '#000' } })]));
    expect(svg).toContain('<filter id="f1" x="-50%" y="-50%" width="200%" height="200%">');
    expect(svg).toContain('<feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b"/>');
    expect(svg).toContain('<feDropShadow in="b" dx="2" dy="4" stdDeviation="1" flood-color="#000"/>');
    expect(svg).toContain('filter="url(#f1)"');
  });

  it('sets mix-blend-mode for a blend other than normal', () => {
    const svg = toSvg(doc([shape({ color: '#fff', width: 2, blend: 'multiply' })]));
    expect(svg).toContain('style="mix-blend-mode:multiply"');
  });

  it('leaves normal blending and sharp items without a filter', () => {
    const svg = toSvg(doc([shape({ color: '#fff', width: 2, blend: 'normal' })]));
    expect(svg).not.toContain('mix-blend-mode');
    expect(svg).not.toContain('filter=');
  });
});

describe('clip and mask svg', () => {
  const clipper: LineItem = { kind: 'line', id: 'c', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, style: { color: '#fff', width: 1 } };
  const target = (mode: 'clip' | 'mask'): LineItem => ({ ...shape({ color: '#fff', width: 2 }), id: 't', clip: { mode, shape: clipper } });

  it('writes a clipPath and wraps the item in a clip-path group', () => {
    const svg = toSvg(doc([target('clip')]));
    expect(svg).toContain('<clipPath id="c1"><path d="M0 0 L10 0"/></clipPath>');
    expect(svg).toContain('<g clip-path="url(#c1)"><path ');
  });

  it('writes a white mask shape and wraps the item in a mask group', () => {
    const svg = toSvg(doc([target('mask')]));
    expect(svg).toContain('<mask id="m1"><path d="M0 0 L10 0" fill="#fff"');
    expect(svg).toContain('<g mask="url(#m1)">');
  });
});

describe('symbols', () => {
  it('writes a symbol once and each instance as a use reference', () => {
    const content: LineItem = { kind: 'line', id: 'a', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, style: { color: '#fff', width: 1 } };
    const d: DocState = {
      width: 10,
      height: 10,
      layers: [
        {
          id: 'l',
          name: 'L',
          visible: true,
          items: [
            { kind: 'group', id: 'i1', items: [content], symbolId: 's1', transform: [1, 0, 0, 1, 2, 3] },
            { kind: 'group', id: 'i2', items: [content], symbolId: 's1', transform: [1, 0, 0, 1, 5, 5] },
          ],
        },
      ],
      symbols: { s1: [content] },
    };
    const svg = toSvg(d);
    expect(svg.match(/<symbol id="symbol-s1">/g)).toHaveLength(1);
    expect(svg.match(/<use href="#symbol-s1"/g)).toHaveLength(2);
    expect(svg).toContain('<use href="#symbol-s1" transform="matrix(1 0 0 1 2 3)"/>');
  });
});


describe('markers and patterns svg', () => {
  it('adds an arrow marker at the end and references it', () => {
    const svg = toSvg(doc([shape({ color: '#fff', width: 2, markerEnd: 'arrow' })]));
    expect(svg).toContain('<marker id="k1" viewBox="0 0 10 10" refX="10" refY="5"');
    expect(svg).toContain('marker-end="url(#k1)"');
    expect(svg).not.toContain('marker-start');
  });

  it('adds a dot marker at the start', () => {
    const svg = toSvg(doc([shape({ color: '#fff', width: 2, markerStart: 'dot' })]));
    expect(svg).toContain('<circle cx="5" cy="5" r="5" fill="#fff"/>');
    expect(svg).toContain('marker-start="url(#k1)"');
  });

  it('fills with a striped pattern in the stroke colour', () => {
    const svg = toSvg(doc([shape({ color: '#abcdef', width: 2, pattern: 'stripes' })]));
    expect(svg).toContain('<pattern id="p1" width="8" height="8" patternUnits="userSpaceOnUse">');
    expect(svg).toContain('fill="url(#p1)"');
  });
});
