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
  | 'effects'
  | 'radius'
  | 'sides'
  | 'inner'
  | 'text'
  | 'nodes'
  | 'edge'
  | 'mask';

export interface OptionContext {
  /** A Modify mask session is open: the mask brush owns the pop-out. */
  maskEditing: boolean;
  /** The selection holds an item whose style can be edited. */
  hasStyled: boolean;
}

/** Controls shared by every shape that has a stroke. */
const STROKE: OptionGroup[] = ['size', 'color', 'lineStyle', 'effects'];
const SHAPE: OptionGroup[] = ['size', 'color', 'fill', 'lineStyle', 'effects'];

/** What the Select tool always offers: its mode, then the actions on the selection. */
const SELECT: OptionGroup[] = ['selectMode', 'selection', 'transform'];

/** The option groups to show, in no particular order. Empty means the pop-out is hidden. */
export function optionGroups(tool: ToolId, ctx: OptionContext): OptionGroup[] {
  if (ctx.maskEditing) return ['size', 'mask'];
  switch (tool) {
    case 'select':
      return ctx.hasStyled ? [...SELECT, ...SHAPE] : SELECT;
    case 'line':
    case 'arc':
    case 'curve':
    case 'brush':
      return STROKE;
    case 'pen':
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

/** The pop-out heading: the tool's name, or the mask brush while a mask session is open. */
export function optionsTitle(tool: ToolId, maskEditing: boolean): string {
  if (maskEditing) return 'Mask brush';
  return tool === 'select' ? 'Select' : tool[0].toUpperCase() + tool.slice(1);
}
