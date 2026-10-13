import { loadPrefs, savePrefs } from '../prefs';
import { $ } from './dom';

export const SIDEBAR_MIN = 160;
export const SIDEBAR_MAX = 420;
export const SIDEBAR_DEFAULT = { left: 240, right: 210 };

export function clampWidth(w: number): number {
  return Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));
}

/** Drag handles between the sidebars and the stage set the sidebar grid column widths. */
export class SidebarResizer {
  constructor() {
    const prefs = loadPrefs();
    this.setWidth('left', prefs.leftWidth ?? SIDEBAR_DEFAULT.left);
    this.setWidth('right', prefs.rightWidth ?? SIDEBAR_DEFAULT.right);
    this.bind('left', 1);
    this.bind('right', -1);
  }

  private setWidth(side: 'left' | 'right', w: number): void {
    document.documentElement.style.setProperty(`--${side}-w`, `${clampWidth(w)}px`);
  }

  /** `sign` is +1 when moving the pointer right widens the sidebar (left), -1 when it narrows it (right). */
  private bind(side: 'left' | 'right', sign: 1 | -1): void {
    const handle = $(`resize-${side}`);
    const aside = $(side);
    let startX = 0;
    let startW = 0;
    handle.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('active');
      startX = e.clientX;
      startW = aside.getBoundingClientRect().width;
    };
    handle.onpointermove = (e) => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      this.setWidth(side, startW + sign * (e.clientX - startX));
    };
    handle.onpointerup = () => {
      handle.classList.remove('active');
      const w = clampWidth(aside.getBoundingClientRect().width);
      savePrefs(side === 'left' ? { leftWidth: w } : { rightWidth: w });
    };
    handle.onpointercancel = handle.onpointerup;
    // Double-click resets the sidebar to its default width.
    handle.ondblclick = () => {
      this.setWidth(side, SIDEBAR_DEFAULT[side]);
      savePrefs(side === 'left' ? { leftWidth: SIDEBAR_DEFAULT.left } : { rightWidth: SIDEBAR_DEFAULT.right });
    };
  }
}
