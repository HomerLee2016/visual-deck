import type { ToolId } from './editor';

/** A block of controls in the Options pop-out. Each is a `data-opt` element in index.html. */
export type OptionGroup =
  | 'selectMode'
  | 'selection'
  | 'transform'
  | 'size'
  | 'color'
  | 'fill'
  | 'lineStyle'
  | 'marker'
  | 'effects'
  | 'radius'
  | 'sides'
  | 'inner'
  | 'text'
  | 'nodes'
  | 'edge'
  | 'mask';

/** What the pop-out needs to know to show only the useful controls. */
export interface OptionContext {
  /** A Modify mask session is open: the mask brush owns the pop-out. */
  maskEditing: boolean;
  /** Kinds of the selected items (`'rect'`, `'text'`, ...). */
  kinds: readonly string[];
  /** The selection holds an item whose style can be edited. */
  styled: boolean;
  /** Something has been copied, so Paste has a use. */
  clipboard: boolean;
  /** A selected item is clipped or masked. */
  clipped: boolean;
}

/** An empty selection and clipboard. */
export const NO_SELECTION: Omit<OptionContext, 'maskEditing'> = { kinds: [], styled: false, clipboard: false, clipped: false };

const FILLABLE = new Set(['rect', 'ellipse', 'polygon', 'star', 'path']);
const OPEN = new Set(['line', 'arc', 'curve', 'path']);

/** Groups for a freshly drawn shape: only the basics. Effects are for the Select tool. */
const LINE: OptionGroup[] = ['size', 'color', 'lineStyle', 'marker'];
const SHAPE: OptionGroup[] = ['size', 'color', 'fill', 'lineStyle'];

/** The option groups to show, in no particular order. Empty means the pop-out is hidden. */
export function optionGroups(tool: ToolId, ctx: OptionContext): OptionGroup[] {
  if (ctx.maskEditing) return ['size', 'mask'];
  switch (tool) {
    case 'select':
      return selectGroups(ctx);
    case 'transform':
      return transformGroups(ctx);
    case 'line':
    case 'arc':
    case 'curve':
      return LINE;
    case 'brush':
      return ['size', 'color', 'lineStyle'];
    case 'pen':
      return [...SHAPE, 'marker'];
    case 'ellipse':
      return SHAPE;
    case 'rect':
      return [...SHAPE, 'radius'];
    case 'polygon':
      return [...SHAPE, 'sides'];
    case 'star':
      return [...SHAPE, 'sides', 'inner'];
    case 'text':
      return ['text', 'color'];
    case 'node':
      return ['nodes'];
    case 'edge':
      return ['size', 'edge'];
  }
}

/** Select shows what the current selection can use, and nothing for an empty one. */
function selectGroups(ctx: OptionContext): OptionGroup[] {
  const groups: OptionGroup[] = ['selectMode'];
  const has = ctx.kinds.length > 0;
  if (has || ctx.clipboard) groups.push('selection');
  if (!has) return groups;
  if (ctx.styled) groups.push('size', 'color', 'lineStyle', 'effects');
  if (ctx.kinds.some((k) => FILLABLE.has(k))) groups.push('fill');
  if (ctx.kinds.some((k) => OPEN.has(k))) groups.push('marker');
  if (ctx.kinds.includes('text')) groups.push('text');
  return groups;
}

/** Transform shows the selection's position and size, and nothing for an empty selection. */
function transformGroups(ctx: OptionContext): OptionGroup[] {
  return ctx.kinds.length > 0 ? ['transform'] : [];
}

/** The Arrange actions the selection can use; each button's `data-*` key (align, flip, ...) is one of these. */
export function arrangeActions(ctx: Pick<OptionContext, 'kinds' | 'styled' | 'clipped'>): Set<string> {
  const n = ctx.kinds.length;
  const has = (...ks: string[]) => ctx.kinds.some((k) => ks.includes(k));
  const out = new Set<string>();
  if (n >= 1) out.add('flip').add('order');
  if (n >= 2) out.add('align').add('group').add('clip');
  if (n >= 3) out.add('distribute');
  if (has('group')) out.add('ungroup');
  if (has('rect', 'ellipse', 'polygon', 'star', 'line', 'arc', 'curve', 'brush')) out.add('convert');
  if (has('path')) out.add('reverse');
  if (has('brush')) out.add('simplify');
  if (has('brush', 'line', 'arc', 'curve', 'path')) out.add('outline');
  if (has('rect', 'ellipse', 'polygon', 'star', 'path', 'line', 'arc', 'curve')) out.add('offset');
  if (ctx.styled) out.add('share').add('unshare');
  if (ctx.clipped) out.add('release');
  return out;
}

/** The pop-out heading: the tool's name, or the mask brush while a mask session is open. */
export function optionsTitle(tool: ToolId, maskEditing: boolean): string {
  if (maskEditing) return 'Mask brush';
  return tool === 'select' ? 'Select' : tool[0].toUpperCase() + tool.slice(1);
}
