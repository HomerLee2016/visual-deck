import type { ToolId } from './editor';

/**
 * Keyboard and mouse settings for the canvas. Pure data and matching, so it is unit-testable.
 * A binding is a key with optional modifiers, e.g. `v`, `Ctrl+Shift+Z`, `Delete`, `Space`.
 * An action may list alternatives separated by spaces (`+ =`). An empty binding means unbound.
 */

export type ToolAction = `tool:${ToolId}`;

export const TOOL_ACTIONS: { id: ToolAction; label: string; key: string }[] = [
  { id: 'tool:select', label: 'Select', key: 'v' },
  { id: 'tool:transform', label: 'Transform', key: 'x' },
  { id: 'tool:line', label: 'Line', key: 'l' },
  { id: 'tool:arc', label: 'Arc', key: 'a' },
  { id: 'tool:curve', label: 'Curve', key: 'c' },
  { id: 'tool:brush', label: 'Brush', key: 'b' },
  { id: 'tool:rect', label: 'Rect', key: 'r' },
  { id: 'tool:ellipse', label: 'Ellipse', key: 'e' },
  { id: 'tool:polygon', label: 'Polygon', key: 'g' },
  { id: 'tool:star', label: 'Star', key: 's' },
  { id: 'tool:text', label: 'Text', key: 't' },
  { id: 'tool:pen', label: 'Pen', key: 'p' },
  { id: 'tool:node', label: 'Node', key: 'n' },
  { id: 'tool:edge', label: 'Edge', key: 'f' },
  { id: 'tool:eraser', label: 'Eraser', key: 'k' },
];

/** Every action that can be bound, in the order the Keyboard tab lists them. */
export const KEY_ACTIONS = [
  { id: 'undo', label: 'Undo', group: 'Edit', key: 'Ctrl+Z' },
  { id: 'redo', label: 'Redo', group: 'Edit', key: 'Ctrl+Shift+Z Ctrl+Y' },
  { id: 'selectAll', label: 'Select all', group: 'Edit', key: 'Ctrl+A' },
  { id: 'copy', label: 'Copy', group: 'Edit', key: 'Ctrl+C' },
  { id: 'cut', label: 'Cut', group: 'Edit', key: 'Ctrl+X' },
  { id: 'delete', label: 'Delete selection', group: 'Edit', key: 'Delete' },
  { id: 'group', label: 'Group', group: 'Edit', key: 'Ctrl+G' },
  { id: 'ungroup', label: 'Ungroup', group: 'Edit', key: 'Ctrl+Shift+G' },
  { id: 'zoomIn', label: 'Zoom in', group: 'View', key: '+ =' },
  { id: 'zoomOut', label: 'Zoom out', group: 'View', key: '-' },
  { id: 'fit', label: 'Fit to window', group: 'View', key: '0' },
  { id: 'zoom100', label: 'Zoom to 100%', group: 'View', key: '1' },
  { id: 'panHold', label: 'Hold to pan (with left drag)', group: 'View', key: 'Space' },
  ...TOOL_ACTIONS.map((t) => ({ id: t.id, label: `Tool: ${t.label}`, group: 'Tools', key: t.key })),
] as const;

export type KeyAction = (typeof KEY_ACTIONS)[number]['id'];
export type KeyMap = Record<KeyAction, string>;

export type WheelMode = 'zoom' | 'pan';
export type WheelSpeed = 0.5 | 1 | 2;

export interface MouseSettings {
  /** Middle-button drag pans the canvas. */
  middlePan: boolean;
  /** What the scroll wheel does on the canvas. Ctrl+wheel always zooms. */
  wheel: WheelMode;
  /** Zoom per wheel notch: 0.5 slow, 1 normal, 2 fast. */
  wheelSpeed: WheelSpeed;
}

export interface ControlSettings {
  keys: KeyMap;
  mouse: MouseSettings;
}

export const DEFAULT_MOUSE: MouseSettings = { middlePan: true, wheel: 'zoom', wheelSpeed: 1 };

export function defaultKeys(): KeyMap {
  return Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a.key])) as KeyMap;
}

export function defaultControls(): ControlSettings {
  return { keys: defaultKeys(), mouse: { ...DEFAULT_MOUSE } };
}

interface ParsedBinding {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

/** Parse one alternative such as `Ctrl+Shift+Z` or `Ctrl++`. Returns null for an empty string. */
export function parseBinding(binding: string): ParsedBinding | null {
  if (!binding) return null;
  const parsed: ParsedBinding = { ctrl: false, shift: false, alt: false, key: '' };
  let rest = binding;
  for (;;) {
    const m = /^(Ctrl|Shift|Alt)\+(?=.)/.exec(rest);
    if (!m) break;
    if (m[1] === 'Ctrl') parsed.ctrl = true;
    else if (m[1] === 'Shift') parsed.shift = true;
    else parsed.alt = true;
    rest = rest.slice(m[0].length);
  }
  parsed.key = rest;
  return parsed.key ? parsed : null;
}

/** The key name an event reports, without modifiers. Letters are lower case, `Space` is named by its code. */
export function eventKeyName(e: Pick<KeyboardEvent, 'key' | 'code'>): string {
  if (e.code === 'Space') return 'Space';
  return normalizeKey(e.key);
}

/** Letters compare case-insensitively; named keys such as `Delete` are kept as they are. */
function normalizeKey(k: string): string {
  return k.length === 1 ? k.toLowerCase() : k;
}

/** Whether a keyboard event is a non-modifier key press that can be bound. */
export function bindableEvent(e: Pick<KeyboardEvent, 'key'>): boolean {
  return !['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(e.key);
}

/** The binding string for a key press, e.g. `Ctrl+Shift+Z`. Used when capturing a new key. */
export function eventToBinding(e: KeyboardEvent): string {
  const key = eventKeyName(e);
  const shown = key.length === 1 ? key.toUpperCase() : key === 'Space' ? 'Space' : key;
  const mods = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.shiftKey ? 'Shift' : '', e.altKey ? 'Alt' : ''].filter(Boolean);
  // Symbols such as `+` already carry Shift on many layouts, so Shift is only kept for letters and names.
  if (key.length === 1 && !/[a-z]/.test(key)) return [...mods.filter((m) => m !== 'Shift'), shown].join('+');
  return [...mods, shown].join('+');
}

/** Whether a key press matches one binding (any of its alternatives). Modifiers must match exactly. */
export function matchesBinding(binding: string, e: KeyboardEvent): boolean {
  if (!bindableEvent(e)) return false;
  const name = eventKeyName(e);
  const mod = e.ctrlKey || e.metaKey;
  for (const alt of binding.split(' ')) {
    const p = parseBinding(alt);
    if (!p || normalizeKey(p.key) !== name || p.ctrl !== mod || p.alt !== e.altKey) continue;
    const symbol = name.length === 1 && !/[a-z]/.test(name);
    if (symbol || p.shift === e.shiftKey) return true;
  }
  return false;
}

/** The action a key press triggers, or null. Tool shortcuts are checked after the other actions. */
export function findAction(keys: KeyMap, e: KeyboardEvent): KeyAction | null {
  for (const a of KEY_ACTIONS) if (matchesBinding(keys[a.id], e)) return a.id;
  return null;
}

/** Display form of a binding, e.g. `Ctrl+Z or Ctrl+Y`. */
export function describeBinding(binding: string): string {
  return binding ? binding.split(' ').join(' or ') : 'none';
}

/**
 * Bind a key to an action. The key is removed from any other action that had it, so no key does two things.
 * Returns a new settings object; the input is not changed.
 */
export function setBinding(keys: KeyMap, action: KeyAction, binding: string): KeyMap {
  const next = { ...keys };
  for (const id of Object.keys(next) as KeyAction[]) {
    if (id === action) continue;
    const alts = next[id].split(' ').filter((alt) => alt && alt !== binding);
    next[id] = alts.join(' ');
  }
  next[action] = binding;
  return next;
}

const KEY = 'visual-deck:controls';

/** Read saved settings. Unknown or missing values fall back to the defaults. Storage may be blocked. */
export function loadControls(): ControlSettings {
  const base = defaultControls();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<{ keys: Partial<KeyMap>; mouse: Partial<MouseSettings> }>;
    for (const a of KEY_ACTIONS) {
      const v = raw.keys?.[a.id];
      if (typeof v === 'string') base.keys[a.id] = v;
    }
    const m = raw.mouse ?? {};
    if (typeof m.middlePan === 'boolean') base.mouse.middlePan = m.middlePan;
    if (m.wheel === 'zoom' || m.wheel === 'pan') base.mouse.wheel = m.wheel;
    if (m.wheelSpeed === 0.5 || m.wheelSpeed === 1 || m.wheelSpeed === 2) base.mouse.wheelSpeed = m.wheelSpeed;
  } catch {
    // Corrupt or blocked storage: keep the defaults.
  }
  return base;
}

export function saveControls(settings: ControlSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage may be blocked or full; the settings still apply for this session.
  }
}
