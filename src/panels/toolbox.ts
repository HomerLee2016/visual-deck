import type { Editor, ToolId } from '../editor';
import type { Style } from '../types';
import { opacityOf } from '../items/shape';
import { $, type ActiveWorkspace } from './dom';

const TOOL_HELP: Record<ToolId, string> = {
  select: 'Click or drag a box to select across all visible layers. Shift adds. Drag to move. Delete / Ctrl+C / Ctrl+V.',
  line: 'Press-drag-release, or click start then click end.',
  arc: 'Drag start→end (or click twice), then click a point the arc passes through.',
  curve: 'Drag start→end (or click twice), then click two control points.',
  brush: 'Press and drag to paint a freehand stroke. Release to finish. A click leaves a dot.',
};

/** Tool buttons, stroke style and the copy / paste / delete actions. */
export class ToolboxPanel {
  constructor(
    private editor: Editor,
    private active: ActiveWorkspace,
  ) {
    document.querySelectorAll<HTMLButtonElement>('#tools button').forEach((b) => {
      b.onclick = () => editor.setTool(b.dataset.tool as ToolId);
    });
    const color = $<HTMLInputElement>('stroke-color');
    const width = $<HTMLInputElement>('stroke-width');
    const range = $<HTMLInputElement>('stroke-width-range');
    color.value = editor.style.color;
    width.value = String(editor.style.width);
    range.value = String(editor.style.width);
    color.oninput = () => editor.setStyle({ color: color.value });
    color.onchange = () => editor.setStyle({ color: color.value }, true);
    // Slider updates live while dragging; the history step is recorded once on release.
    range.oninput = () => {
      width.value = range.value;
      editor.setStyle({ width: Number(range.value) });
    };
    range.onchange = () => editor.setStyle({ width: Number(range.value) }, true);
    width.onchange = () => {
      const w = Math.min(64, Math.max(1, Number(width.value) || 1));
      width.value = String(w);
      range.value = String(w);
      editor.setStyle({ width: w }, true);
    };
    const fill = $<HTMLInputElement>('fill-color');
    const fillNone = $<HTMLInputElement>('fill-none');
    const opacity = $<HTMLInputElement>('stroke-opacity');
    const opacityOut = $('stroke-opacity-out');
    fill.value = editor.style.fill ?? fill.value;
    fillNone.checked = !editor.style.fill;
    fill.disabled = fillNone.checked;
    opacity.value = String(Math.round(opacityOf(editor.style) * 100));
    opacityOut.textContent = `${opacity.value}%`;
    // Picking a colour turns "None" off; the fill applies to the selection on release.
    fill.oninput = () => {
      fillNone.checked = false;
      fill.disabled = false;
      editor.setStyle({ fill: fill.value });
    };
    fill.onchange = () => editor.setStyle({ fill: fill.value }, true);
    fillNone.onchange = () => {
      fill.disabled = fillNone.checked;
      editor.setStyle({ fill: fillNone.checked ? undefined : fill.value }, true);
    };
    opacity.oninput = () => {
      opacityOut.textContent = `${opacity.value}%`;
      editor.setStyle({ opacity: Number(opacity.value) / 100 });
    };
    opacity.onchange = () => editor.setStyle({ opacity: Number(opacity.value) / 100 }, true);
    const cap = $<HTMLSelectElement>('stroke-cap');
    const join = $<HTMLSelectElement>('stroke-join');
    const miter = $<HTMLInputElement>('stroke-miter');
    const dashSel = $<HTMLSelectElement>('stroke-dash');
    cap.value = editor.style.cap ?? 'round';
    join.value = editor.style.join ?? 'round';
    miter.value = String(editor.style.miterLimit ?? 10);
    cap.onchange = () => editor.setStyle({ cap: cap.value as Style['cap'] }, true);
    join.onchange = () => editor.setStyle({ join: join.value as Style['join'] }, true);
    miter.onchange = () => {
      const m = Math.min(100, Math.max(1, Number(miter.value) || 10));
      miter.value = String(m);
      editor.setStyle({ miterLimit: m }, true);
    };
    // Dash lengths scale with the stroke width so the pattern stays readable when the width changes.
    dashSel.onchange = () => {
      const w = editor.style.width;
      const dash = { solid: undefined, dashed: [4 * w, 2 * w], dotted: [w, 2 * w] }[dashSel.value as 'solid' | 'dashed' | 'dotted'];
      editor.setStyle({ dash }, true);
    };
    $('act-copy').onclick = () => editor.copy();
    $('act-paste').onclick = () => editor.pasteClipboard();
    $('act-delete').onclick = () => editor.deleteSelection();
  }

  render(): void {
    document.querySelectorAll<HTMLButtonElement>('#tools button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === this.editor.tool);
    });
    $('tool-help').textContent = TOOL_HELP[this.editor.tool];
    const has = this.active().selection.size > 0;
    $<HTMLButtonElement>('act-copy').disabled = !has;
    $<HTMLButtonElement>('act-delete').disabled = !has;
    $<HTMLButtonElement>('act-paste').disabled = this.editor.clipboard.length === 0;
  }
}
