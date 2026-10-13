import type { Editor } from '../editor';
import { optionGroups, optionsTitle, type OptionGroup } from '../options';
import { typeOf } from '../items/registry';
import { $, type ActiveWorkspace } from './dom';
import { pickerStyle } from './toolbox';

/** How the shared Size control reads and writes, which depends on what the brush is painting. */
interface SizeBinding {
  label: string;
  min: number;
  max: number;
  value: number;
  /** `final` is false while a slider is being dragged, true once the value is committed. */
  set(v: number, final: boolean): void;
}

/**
 * The Options pop-out over the canvas. It shows only the control groups the active tool
 * needs (see `optionGroups`), and owns the Size control that Brush, Mask brush and Edge share.
 * The other controls are wired by the panel that owns their setting (ToolboxPanel).
 */
export class OptionsPanel {
  private size = $<HTMLInputElement>('opt-size');
  private range = $<HTMLInputElement>('opt-size-range');
  private binding: SizeBinding | null = null;

  constructor(
    private editor: Editor,
    private active: ActiveWorkspace,
  ) {
    const commit = (final: boolean, el: HTMLInputElement) => {
      const b = this.binding;
      if (!b) return;
      const v = Math.min(b.max, Math.max(b.min, Math.round(Number(el.value)) || b.min));
      this.size.value = this.range.value = String(v);
      b.set(v, final);
    };
    this.range.oninput = () => commit(false, this.range);
    this.range.onchange = () => commit(true, this.range);
    this.size.onchange = () => commit(true, this.size);
    document.querySelectorAll<HTMLInputElement>('input[name="mask-op"]').forEach((r) => {
      r.onchange = () => editor.setMaskBrush({ op: r.value as 'add' | 'remove' });
    });
    $('mask-confirm').onclick = () => editor.confirmMaskEdit();
    $('mask-cancel').onclick = () => editor.cancelMaskEdit();
  }

  private sizeBinding(): SizeBinding {
    const e = this.editor;
    if (e.maskEditing) {
      return { label: 'Brush size', min: 1, max: 256, value: e.maskRadius * 2, set: (v) => e.setMaskBrush({ radius: v / 2 }) };
    }
    if (e.tool === 'edge') {
      return { label: 'Brush size', min: 1, max: 256, value: e.edgeSettings.radius * 2, set: (v) => e.setEdgeRadius(v / 2) };
    }
    return {
      label: 'Width',
      min: 1,
      max: 64,
      value: pickerStyle(e, this.active()).width,
      set: (v, final) => e.setStyle({ width: v }, final),
    };
  }

  render(): void {
    const e = this.editor;
    const hasStyled = this.active().selectedItems().some((it) => typeOf(it).withStyle !== undefined);
    const groups = new Set<OptionGroup>(optionGroups(e.tool, { maskEditing: e.maskEditing, hasStyled }));
    $('options').hidden = groups.size === 0;
    $('options-title').textContent = `${optionsTitle(e.tool, e.maskEditing)} options`;
    document.querySelectorAll<HTMLElement>('#options [data-opt]').forEach((el) => {
      el.hidden = !groups.has(el.dataset.opt as OptionGroup);
    });
    document.querySelectorAll<HTMLInputElement>('input[name="mask-op"]').forEach((r) => {
      r.checked = r.value === e.maskOp;
    });
    // The Size control follows the current binding, so a stale slider never edits the wrong thing.
    const b = (this.binding = this.sizeBinding());
    $('opt-size-label').textContent = b.label;
    for (const el of [this.size, this.range]) {
      el.min = String(b.min);
      el.max = String(b.max);
      el.value = String(Math.round(b.value));
    }
  }
}
