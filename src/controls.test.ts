import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultControls,
  defaultKeys,
  describeBinding,
  eventToBinding,
  findAction,
  loadControls,
  matchesBinding,
  parseBinding,
  saveControls,
  setBinding,
} from './controls';

/** A minimal keyboard event; only the fields the matcher reads. */
function key(k: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}, code = ''): KeyboardEvent {
  return {
    key: k,
    code: code || (k.length === 1 ? `Key${k.toUpperCase()}` : k),
    ctrlKey: !!mods.ctrl,
    metaKey: false,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
  } as KeyboardEvent;
}

describe('parseBinding', () => {
  it('reads modifiers and the key', () => {
    expect(parseBinding('Ctrl+Shift+Z')).toEqual({ ctrl: true, shift: true, alt: false, key: 'Z' });
  });

  it('treats a plus key as the key, not a separator', () => {
    expect(parseBinding('Ctrl++')).toEqual({ ctrl: true, shift: false, alt: false, key: '+' });
    expect(parseBinding('+')?.key).toBe('+');
  });

  it('returns null for an empty binding', () => {
    expect(parseBinding('')).toBeNull();
  });
});

describe('matchesBinding', () => {
  it('matches a plain key only without modifiers', () => {
    expect(matchesBinding('v', key('v'))).toBe(true);
    expect(matchesBinding('v', key('v', { ctrl: true }))).toBe(false);
    expect(matchesBinding('v', key('v', { shift: true }))).toBe(false);
  });

  it('matches letters case-insensitively and checks Shift exactly', () => {
    expect(matchesBinding('Ctrl+Z', key('z', { ctrl: true }))).toBe(true);
    expect(matchesBinding('Ctrl+Z', key('Z', { ctrl: true }))).toBe(true);
    expect(matchesBinding('Ctrl+Z', key('z', { ctrl: true, shift: true }))).toBe(false);
  });

  it('ignores Shift for symbol keys, so Shift+= matches +', () => {
    expect(matchesBinding('+', key('+', { shift: true }, 'Equal'))).toBe(true);
    expect(matchesBinding('-', key('-'))).toBe(true);
  });

  it('matches any alternative', () => {
    expect(matchesBinding('Ctrl+Shift+Z Ctrl+Y', key('y', { ctrl: true }))).toBe(true);
    expect(matchesBinding('+ =', key('='))).toBe(true);
  });

  it('matches Space by its code', () => {
    expect(matchesBinding('Space', key(' ', {}, 'Space'))).toBe(true);
  });

  it('never matches a bare modifier press or an empty binding', () => {
    expect(matchesBinding('Ctrl', key('Control'))).toBe(false);
    expect(matchesBinding('', key('v'))).toBe(false);
  });
});

describe('findAction', () => {
  it('finds the default action for a key', () => {
    const keys = defaultKeys();
    expect(findAction(keys, key('z', { ctrl: true }))).toBe('undo');
    expect(findAction(keys, key('v'))).toBe('tool:select');
    expect(findAction(keys, key('q'))).toBeNull();
  });
});

describe('eventToBinding', () => {
  it('builds the binding string used when capturing a key', () => {
    expect(eventToBinding(key('z', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+Z');
    expect(eventToBinding(key('+', { shift: true }, 'Equal'))).toBe('+');
    expect(eventToBinding(key(' ', {}, 'Space'))).toBe('Space');
    expect(eventToBinding(key('Delete'))).toBe('Delete');
  });

  it('round-trips through matchesBinding', () => {
    const e = key('g', { ctrl: true, alt: true });
    expect(matchesBinding(eventToBinding(e), e)).toBe(true);
  });
});

describe('setBinding', () => {
  it('moves a key from the action that had it', () => {
    const next = setBinding(defaultKeys(), 'fit', 'v');
    expect(next.fit).toBe('v');
    expect(next['tool:select']).toBe('');
  });

  it('does not change its input', () => {
    const keys = defaultKeys();
    setBinding(keys, 'fit', 'q');
    expect(keys.fit).toBe('0');
  });

  it('keeps the other alternatives of an action when one is taken', () => {
    const next = setBinding(defaultKeys(), 'zoomOut', '=');
    expect(next.zoomIn).toBe('+');
    expect(next.zoomOut).toBe('=');
  });
});

describe('describeBinding', () => {
  it('joins alternatives and names an empty binding', () => {
    expect(describeBinding('Ctrl+Z Ctrl+Y')).toBe('Ctrl+Z or Ctrl+Y');
    expect(describeBinding('')).toBe('none');
  });
});

describe('saved settings', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubStorage(initial: string | null) {
    const store = new Map<string, string>();
    if (initial !== null) store.set('visual-deck:controls', initial);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    return store;
  }

  it('returns defaults when nothing is saved', () => {
    stubStorage(null);
    expect(loadControls()).toEqual(defaultControls());
  });

  it('round-trips a change', () => {
    stubStorage(null);
    const c = defaultControls();
    c.keys = setBinding(c.keys, 'fit', 'f');
    c.mouse = { panButton: 'right', wheel: 'pan', wheelSpeed: 2 };
    saveControls(c);
    expect(loadControls()).toEqual(c);
  });

  it('ignores invalid stored values and keeps the rest', () => {
    stubStorage(JSON.stringify({ keys: { fit: 'f', undo: 5 }, mouse: { wheel: 'sideways', wheelSpeed: 3, panButton: 'left' } }));
    const c = loadControls();
    expect(c.keys.fit).toBe('f');
    expect(c.keys.undo).toBe('Ctrl+Z');
    expect(c.mouse).toEqual({ panButton: 'middle', wheel: 'zoom', wheelSpeed: 1 });
  });

  it('migrates the old middle-button checkbox', () => {
    stubStorage(JSON.stringify({ mouse: { middlePan: false } }));
    expect(loadControls().mouse.panButton).toBe('none');
    stubStorage(JSON.stringify({ mouse: { middlePan: true } }));
    expect(loadControls().mouse.panButton).toBe('middle');
  });

  it('falls back to defaults on corrupt JSON or blocked storage', () => {
    stubStorage('{not json');
    expect(loadControls()).toEqual(defaultControls());
    vi.unstubAllGlobals();
    expect(loadControls()).toEqual(defaultControls());
  });
});
