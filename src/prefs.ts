/** Remembered UI layout: sidebar widths and collapsed sections. Browser-only, so storage can fail. */
export interface UiPrefs {
  leftWidth?: number;
  rightWidth?: number;
  /** Ids of collapsed sidebar sections (see `data-id` in index.html). */
  collapsed?: string[];
}

const KEY = 'visual-deck:ui';

export function loadPrefs(): UiPrefs {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as UiPrefs;
  } catch {
    return {};
  }
}

export function savePrefs(patch: UiPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    // Storage may be blocked or full; the layout still works for this session.
  }
}
