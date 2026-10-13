import type { BlendMode, Shadow, Style } from '../types';

/** Canvas composite operation for a blend mode. */
export const compositeOf = (b: BlendMode | undefined): GlobalCompositeOperation => (!b || b === 'normal' ? 'source-over' : b);

/** Canvas `filter` string for blur and drop shadow, or 'none'. */
export function canvasFilter(style: Style): string {
  const parts: string[] = [];
  if (style.blur && style.blur > 0) parts.push(`blur(${style.blur}px)`);
  const sh: Shadow | undefined = style.shadow;
  if (sh) parts.push(`drop-shadow(${sh.dx}px ${sh.dy}px ${sh.blur}px ${sh.color})`);
  return parts.length ? parts.join(' ') : 'none';
}

/** Whether the style asks for any effect that needs an SVG <filter>. */
export const hasFilter = (style: Style) => (style.blur ?? 0) > 0 || !!style.shadow;
