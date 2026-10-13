import { describe, expect, it } from 'vitest';
import type { ToolId } from './editor';
import { arrangeActions, NO_SELECTION, optionGroups, optionsTitle, type OptionContext } from './options';

const idle: OptionContext = { maskEditing: false, ...NO_SELECTION };
const sel = (kinds: string[], extra: Partial<OptionContext> = {}): OptionContext => ({ ...idle, kinds, styled: true, ...extra });

describe('optionGroups', () => {
  it('shows only size, colour and line style for the brush', () => {
    expect(optionGroups('brush', idle).sort()).toEqual(['color', 'lineStyle', 'size']);
  });

  it('gives mask brush and brush the same size control', () => {
    expect(optionGroups('brush', idle)).toContain('size');
    expect(optionGroups('brush', { ...idle, maskEditing: true })).toEqual(['size', 'mask']);
  });

  it('lets a mask session override the active tool', () => {
    const tools: ToolId[] = ['select', 'line', 'rect', 'text', 'edge'];
    for (const t of tools) expect(optionGroups(t, { ...idle, maskEditing: true })).toEqual(['size', 'mask']);
  });

  it('shows shape-specific rows only for their shape', () => {
    expect(optionGroups('rect', idle)).toContain('radius');
    expect(optionGroups('ellipse', idle)).not.toContain('radius');
    expect(optionGroups('polygon', idle)).toContain('sides');
    expect(optionGroups('polygon', idle)).not.toContain('inner');
    expect(optionGroups('star', idle)).toEqual(expect.arrayContaining(['sides', 'inner']));
  });

  it('keeps fill off lines and effects off every drawing tool', () => {
    expect(optionGroups('line', idle)).not.toContain('fill');
    for (const t of ['line', 'brush', 'rect', 'pen'] as ToolId[]) expect(optionGroups(t, idle)).not.toContain('effects');
  });

  it('shows only the select mode when nothing is selected', () => {
    expect(optionGroups('select', idle)).toEqual(['selectMode']);
  });

  it('offers Paste for select once something is on the clipboard', () => {
    expect(optionGroups('select', { ...idle, clipboard: true })).toEqual(['selectMode', 'selection']);
  });

  it('shows only what the selection can use', () => {
    const rect = optionGroups('select', sel(['rect']));
    expect(rect).toEqual(expect.arrayContaining(['selection', 'transform', 'color', 'fill', 'effects']));
    expect(rect).not.toContain('marker');
    expect(rect).not.toContain('text');
    const line = optionGroups('select', sel(['line']));
    expect(line).toContain('marker');
    expect(line).not.toContain('fill');
    expect(optionGroups('select', sel(['text']))).toContain('text');
  });

  it('hides style groups for a selection with nothing styled', () => {
    const g = optionGroups('select', sel(['image'], { styled: false }));
    expect(g).toEqual(['selectMode', 'selection', 'transform']);
  });

  it('shares the size control with the edge brush', () => {
    expect(optionGroups('edge', idle)).toEqual(['size', 'edge']);
  });

  it('never returns an empty list for a tool', () => {
    const all: ToolId[] = ['select', 'line', 'arc', 'curve', 'brush', 'rect', 'ellipse', 'polygon', 'star', 'text', 'pen', 'node', 'edge'];
    for (const t of all) expect(optionGroups(t, idle).length).toBeGreaterThan(0);
  });
});

describe('arrangeActions', () => {
  it('offers nothing for an empty selection', () => {
    expect(arrangeActions({ kinds: [], styled: false, clipped: false }).size).toBe(0);
  });

  it('needs enough items for align, distribute, group and clip', () => {
    const one = arrangeActions(sel(['rect']));
    expect([...one].sort()).toEqual(expect.arrayContaining(['flip', 'order']));
    for (const k of ['align', 'distribute', 'group', 'clip']) expect(one.has(k)).toBe(false);
    const two = arrangeActions(sel(['rect', 'rect']));
    expect(two.has('align') && two.has('group') && two.has('clip')).toBe(true);
    expect(two.has('distribute')).toBe(false);
    expect(arrangeActions(sel(['rect', 'rect', 'rect'])).has('distribute')).toBe(true);
  });

  it('offers path actions only for kinds that support them', () => {
    expect(arrangeActions(sel(['brush'])).has('simplify')).toBe(true);
    expect(arrangeActions(sel(['rect'])).has('simplify')).toBe(false);
    expect(arrangeActions(sel(['path'])).has('reverse')).toBe(true);
    expect(arrangeActions(sel(['image'], { styled: false })).has('convert')).toBe(false);
  });

  it('offers Ungroup for groups and Release for clipped items', () => {
    expect(arrangeActions(sel(['group'])).has('ungroup')).toBe(true);
    expect(arrangeActions(sel(['rect'])).has('release')).toBe(false);
    expect(arrangeActions(sel(['rect'], { clipped: true })).has('release')).toBe(true);
  });
});

describe('optionsTitle', () => {
  it('names the tool or the mask brush', () => {
    expect(optionsTitle('brush', false)).toBe('Brush');
    expect(optionsTitle('brush', true)).toBe('Mask brush');
  });
});
