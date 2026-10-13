import { describe, expect, it } from 'vitest';
import { SIDEBAR_MAX, SIDEBAR_MIN, clampWidth } from './resizer';

describe('clampWidth', () => {
  it('keeps sidebars within the min and max width', () => {
    expect(clampWidth(10)).toBe(SIDEBAR_MIN);
    expect(clampWidth(9999)).toBe(SIDEBAR_MAX);
    expect(clampWidth(240.4)).toBe(240);
  });
});
