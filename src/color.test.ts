import { describe, expect, it } from 'vitest';
import { parseColor, withAlpha } from './color';

describe('stroke colour with opacity', () => {
  it('keeps fully opaque colours as plain hex', () => {
    expect(withAlpha('#ffcc00', 1)).toBe('#ffcc00');
    expect(parseColor('#ffcc00')).toEqual({ hex: '#ffcc00', alpha: 1 });
  });

  it('writes partial opacity as rgba and reads it back', () => {
    const css = withAlpha('#ff8000', 0.5);
    expect(css).toBe('rgba(255, 128, 0, 0.5)');
    expect(parseColor(css)).toEqual({ hex: '#ff8000', alpha: 0.5 });
  });

  it('clamps opacity and keeps zero as a transparent colour', () => {
    expect(withAlpha('#000000', -1)).toBe('rgba(0, 0, 0, 0)');
    expect(withAlpha('#000000', 3)).toBe('#000000');
  });

  it('falls back to opaque black for colours it cannot split', () => {
    expect(parseColor('red')).toEqual({ hex: '#000000', alpha: 1 });
  });
});
