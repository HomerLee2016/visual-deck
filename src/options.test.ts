import { describe, expect, it } from 'vitest';
import type { ToolId } from './editor';
import { optionGroups, optionsTitle } from './options';

const idle = { maskEditing: false, hasStyled: false };

describe('optionGroups', () => {
  it('shows size and colour for the brush', () => {
    const g = optionGroups('brush', idle);
    expect(g).toContain('size');
    expect(g).toContain('color');
    expect(g).not.toContain('fill');
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

  it('shows style groups for select only when something styled is selected', () => {
    expect(optionGroups('select', idle)).toEqual(['selectMode', 'selection', 'transform']);
    expect(optionGroups('select', { ...idle, hasStyled: true })).toEqual(expect.arrayContaining(['selectMode', 'color', 'fill']));
  });

  it('puts Transform and Selection with the Select tool only', () => {
    expect(optionGroups('select', idle)).toEqual(expect.arrayContaining(['transform', 'selection']));
    expect(optionGroups('brush', idle)).not.toContain('transform');
  });

  it('shares the size control with the edge brush', () => {
    expect(optionGroups('edge', idle)).toEqual(['size', 'edge']);
  });

  it('never returns an empty list for a tool with options', () => {
    const all: ToolId[] = ['select', 'line', 'arc', 'curve', 'brush', 'rect', 'ellipse', 'polygon', 'star', 'text', 'pen', 'node', 'edge'];
    for (const t of all) expect(optionGroups(t, idle).length).toBeGreaterThan(0);
  });
});

describe('optionsTitle', () => {
  it('names the tool or the mask brush', () => {
    expect(optionsTitle('brush', false)).toBe('Brush');
    expect(optionsTitle('brush', true)).toBe('Mask brush');
  });
});
