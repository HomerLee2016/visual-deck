import { describe, expect, it } from 'vitest';
import { apply } from '../matrix';
import { parseColor, parseDash, parseLength, parseTransform } from './attrs';

describe('svg attributes', () => {
  it('composes transform functions left to right', () => {
    const m = parseTransform('translate(10 0) rotate(90)')!;
    const p = apply(m, { x: 1, y: 0 }); // rotate first (1,0)->(0,1), then translate -> (10,1)
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(1);
  });

  it('reads matrix() and scale()', () => {
    expect(parseTransform('matrix(1,0,0,1,5,6)')).toEqual([1, 0, 0, 1, 5, 6]);
    expect(parseTransform('scale(2)')).toEqual([2, 0, 0, 2, 0, 0]);
    expect(parseTransform(undefined)).toBeUndefined();
  });

  it('reads hex, rgb and named colours, and none', () => {
    expect(parseColor('#f00')).toBe('#ff0000');
    expect(parseColor('#00FF7F')).toBe('#00ff7f');
    expect(parseColor('rgb(255, 0, 128)')).toBe('#ff0080');
    expect(parseColor('rgb(100%, 0%, 50%)')).toBe('#ff0080');
    expect(parseColor('red')).toBe('#ff0000');
    expect(parseColor('none')).toBe('none');
    expect(parseColor('url(#g1)')).toBeNull();
  });

  it('reads lengths and ignores percentages', () => {
    expect(parseLength('12px', 1)).toBe(12);
    expect(parseLength('3.5', 1)).toBe(3.5);
    expect(parseLength('50%', 7)).toBe(7);
  });

  it('reads dash arrays and treats odd counts as on/off pairs', () => {
    expect(parseDash('4 2')).toEqual([4, 2]);
    expect(parseDash('4')).toEqual([4, 4]);
    expect(parseDash('none')).toBeUndefined();
    expect(parseDash('0 0')).toBeUndefined();
  });
});
