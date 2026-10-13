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
