import type { Editor, SelectMode, ToolId } from '../editor';
import { parseColor, withAlpha } from '../color';
import type { ShapeItem, Style } from '../types';
import { typeOf } from '../items/registry';
import { opacityOf } from '../items/shape';
import type { TextStyle } from '../items/text';
import type { Workspace } from '../model';
import { $, type ActiveWorkspace } from './dom';

const TOOL_HELP: Record<ToolId, string> = {
  select: 'Click or drag a box to select across all visible layers. Shift adds. Drag to move. Click a point on a selected brush stroke to pick it; Delete removes picked points. Ctrl+C / Ctrl+V.',
  line: 'Press-drag-release, or click start then click end.',
  arc: 'Drag start→end (or click twice), then click a point the arc passes through.',
  curve: 'Drag start→end (or click twice), then click two control points.',
  brush: 'Press and drag to paint a freehand stroke. Release to finish. A click leaves a dot.',
  rect: 'Drag or click two opposite corners. Shift for a square. Corner radius applies to new rectangles.',
  ellipse: 'Drag or click two opposite corners of the bounding box. Shift for a circle.',
  polygon: 'Click the centre, then a vertex. Sides are in Options. Shift snaps the angle.',
  node: 'Click a node or handle to select it; drag to move it. Double-click a segment to add a node. Delete removes selected nodes.',
  pen: 'Click to place corner nodes; drag to make a smooth node. Click the first node or press Enter to finish; Esc finishes an open path.',
  text: 'Click where the text goes and type. Ctrl+Enter or click away places it; Esc cancels. Double-click text to edit.',
  star: 'Click the centre, then a point. Points and inner radius are in Options. Shift snaps the angle.',
  edge: 'Paint over a cut-out edge with a light fringe. Only painted pixels near transparency change. Apply (Enter) rasterizes the layer; Cancel (Esc) discards.',
};

const SELECT_HELP: Record<SelectMode, string> = {
  object: 'Click or drag a box to select items across visible layers. Shift adds. Drag to move. Click a point on a selected brush stroke to pick it. Ctrl+C / Ctrl+V.',
  layer: 'Click an item to select its whole layer and make it the active layer. A box selects every layer it touches. Shift adds.',
  points: 'Click a point on a brush stroke to select it. Shift adds points. Delete removes the selected points.',
};

/** `#rrggbb` from a colour input into 0-255 channels. */
function parseRgb(hex: string): { r: number; g: number; b: number } {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/** The style the pickers show: the selected item's when exactly one styled item is selected, else the drawing style. */
export function pickerStyle(editor: Editor, ws: Workspace): Style {
  const styled = ws.selectedItems().filter((it): it is ShapeItem => 'style' in it && typeOf(it).withStyle !== undefined);
  return styled.length === 1 ? styled[0].style : editor.style;
}

/** Tool buttons, the colour / fill / effect pickers in the Options pop-out, and the copy / paste / delete actions. */
export class ToolboxPanel {
  constructor(
    private editor: Editor,
    private active: ActiveWorkspace,
  ) {
    document.querySelectorAll<HTMLButtonElement>('#tools button').forEach((b) => {
      b.onclick = () => editor.setTool(b.dataset.tool as ToolId);
    });
    const color = $<HTMLInputElement>('stroke-color');
    const alpha = $<HTMLInputElement>('stroke-alpha-range');
    const alphaOut = $('stroke-alpha-value');
    // The colour input has no alpha, so colour and opacity are combined here.
    const apply = (applyToSelection: boolean) =>
      editor.setStyle({ color: withAlpha(color.value, Number(alpha.value) / 100) }, applyToSelection);
    color.oninput = () => apply(false);
    color.onchange = () => apply(true);
    alpha.oninput = () => {
      alphaOut.textContent = `${alpha.value}%`;
      apply(false);
    };
    alpha.onchange = () => apply(true);
    const fill = $<HTMLInputElement>('fill-color');
    const fillNone = $<HTMLInputElement>('fill-none');
    const opacity = $<HTMLInputElement>('stroke-opacity');
    const opacityOut = $('stroke-opacity-out');
    // Picking a colour turns "None" off; the fill applies to the selection on release.
    fill.oninput = () => {
      fillNone.checked = false;
      fill.disabled = false;
      editor.setStyle({ fill: fill.value });
      this.render();
    };
    fill.onchange = () => editor.setStyle({ fill: fill.value }, true);
    fillNone.onchange = () => {
      fill.disabled = fillNone.checked;
      editor.setStyle({ fill: fillNone.checked ? undefined : fill.value }, true);
      this.render();
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
    join.onchange = () => {
      editor.setStyle({ join: join.value as Style['join'] }, true);
      this.render();
    };
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
    const radius = $<HTMLInputElement>('shape-radius');
    radius.value = String(editor.params.radius);
    radius.onchange = () => {
      const r = Math.min(512, Math.max(0, Number(radius.value) || 0));
      radius.value = String(r);
      editor.setParams({ radius: r });
    };
    const sides = $<HTMLInputElement>('shape-sides');
    const inner = $<HTMLInputElement>('shape-inner');
    sides.value = String(editor.params.sides);
    inner.value = String(Math.round(editor.params.inner * 100));
    sides.onchange = () => {
      const n = Math.min(64, Math.max(3, Math.round(Number(sides.value)) || 6));
      sides.value = String(n);
      editor.setParams({ sides: n });
    };
    inner.onchange = () => {
      const pct = Math.min(100, Math.max(5, Math.round(Number(inner.value)) || 50));
      inner.value = String(pct);
      editor.setParams({ inner: pct / 100 });
    };
    const edgeBg = $<HTMLInputElement>('edge-bg');
    const edgeBand = $<HTMLInputElement>('edge-band');
    const edgeLight = $<HTMLInputElement>('edge-light');
    const edgeMode = $<HTMLSelectElement>('edge-mode');
    const edgeInt = (el: HTMLInputElement, min: number, max: number, fallback: number) => {
      const n = Math.min(max, Math.max(min, Math.round(Number(el.value)) || fallback));
      el.value = String(n);
      return n;
    };
    edgeBg.onchange = () => {
      const { r, g, b } = parseRgb(edgeBg.value);
      editor.setEdgeOptions({ background: [r, g, b] });
    };
    edgeBand.onchange = () => editor.setEdgeOptions({ band: edgeInt(edgeBand, 1, 32, 2) });
    edgeLight.onchange = () => editor.setEdgeOptions({ lightness: edgeInt(edgeLight, 0, 255, 200) });
    edgeMode.onchange = () => editor.setEdgeOptions({ mode: edgeMode.value as 'fill' | 'remove' });
    $('edge-apply').onclick = () => editor.applyEdge();
    $('edge-cancel').onclick = () => editor.cancelEdge();
    const font = $<HTMLSelectElement>('text-font');
    const size = $<HTMLInputElement>('text-size');
    const weight = $<HTMLSelectElement>('text-weight');
    const align = $<HTMLSelectElement>('text-align');
    font.value = editor.textStyle.font;
    size.value = String(editor.textStyle.size);
    weight.value = String(editor.textStyle.weight);
    align.value = editor.textStyle.align;
    font.onchange = () => editor.setTextStyle({ font: font.value }, true);
    weight.onchange = () => editor.setTextStyle({ weight: Number(weight.value) }, true);
    align.onchange = () => editor.setTextStyle({ align: align.value as TextStyle['align'] }, true);
    size.onchange = () => {
      const n = Math.min(512, Math.max(1, Number(size.value) || 24));
      size.value = String(n);
      editor.setTextStyle({ size: n }, true);
    };
    const paint = $<HTMLSelectElement>('fill-paint');
    const gradEditor = $('grad-editor');
    const stopsBox = $('grad-stops');
    const renderStops = () => {
      const g = editor.style.fillGradient;
      gradEditor.hidden = !g;
      stopsBox.replaceChildren();
      if (!g) return;
      g.stops.forEach((stop, i) => {
        const row = document.createElement('div');
        row.className = 'grad-stop';
        const color = Object.assign(document.createElement('input'), { type: 'color', value: stop.color, title: 'Stop colour' });
        const offset = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 100, step: 1, value: String(Math.round(stop.offset * 100)), title: 'Stop position (%)' });
        const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: '×', title: 'Remove stop', disabled: g.stops.length <= 2 });
        const update = (apply: boolean) => {
          const stops = editor.style.fillGradient!.stops.map((s, j) =>
            j === i ? { color: color.value, offset: Math.min(1, Math.max(0, Number(offset.value) / 100 || 0)) } : s,
          );
          editor.setFillStops(stops, apply);
        };
        color.oninput = () => update(false);
        color.onchange = () => update(true);
        offset.onchange = () => update(true);
        remove.onclick = () => {
          editor.setFillStops(editor.style.fillGradient!.stops.filter((_, j) => j !== i), true);
          renderStops();
        };
        row.append(color, offset, remove);
        stopsBox.append(row);
      });
    };
    paint.onchange = () => {
      editor.setFillPaint(paint.value as 'solid' | 'linear' | 'radial');
      renderStops();
      this.render();
    };
    $('grad-add').onclick = () => {
      const g = editor.style.fillGradient;
      if (!g) return;
      // The new stop sits midway between the last two, in the last one's colour.
      const [prev, last] = g.stops.slice(-2);
      const mid = prev && last ? { offset: (prev.offset + last.offset) / 2, color: last.color } : { offset: 0.5, color: '#888888' };
      const stops = [...g.stops, mid].sort((a, b) => a.offset - b.offset);
      editor.setFillStops(stops, true);
      renderStops();
    };
    renderStops();
    const pattern = $<HTMLSelectElement>('fx-pattern');
    const marker = $<HTMLSelectElement>('fx-marker');
    pattern.value = editor.style.pattern ?? '';
    marker.value = editor.style.markerEnd ?? '';
    pattern.onchange = () => editor.setStyle({ pattern: (pattern.value || undefined) as Style['pattern'] }, true);
    marker.onchange = () => editor.setStyle({ markerEnd: (marker.value || undefined) as Style['markerEnd'] }, true);
    const blend = $<HTMLSelectElement>('fx-blend');
    const blur = $<HTMLInputElement>('fx-blur');
    const shadow = $<HTMLInputElement>('fx-shadow');
    blend.value = editor.style.blend ?? 'normal';
    blur.value = String(editor.style.blur ?? 0);
    shadow.checked = !!editor.style.shadow;
    blend.onchange = () => editor.setStyle({ blend: blend.value as Style['blend'] }, true);
    blur.onchange = () => {
      const b = Math.min(64, Math.max(0, Number(blur.value) || 0));
      blur.value = String(b);
      editor.setStyle({ blur: b }, true);
    };
    // The shadow starts as a soft, offset black; its values are not yet editable.
    shadow.onchange = () => editor.setStyle({ shadow: shadow.checked ? { dx: 4, dy: 4, blur: 6, color: '#000000' } : undefined }, true);
    $('node-smooth').onclick = () => editor.setNodesSmooth(true);
    $('node-corner').onclick = () => editor.setNodesSmooth(false);
    const selectMode = $<HTMLSelectElement>('select-mode');
    selectMode.onchange = () => editor.setSelectMode(selectMode.value as SelectMode);
    $('act-copy').onclick = () => editor.copy();
    $('act-paste').onclick = () => editor.pasteClipboard();
    $('act-delete').onclick = () => editor.deleteSelection();
  }

  /** The style the pickers show: the selected item's when exactly one styled item is selected, else the drawing style. */
  private pickerStyle(): Style {
    return pickerStyle(this.editor, this.active());
  }

  /** Sets the colour, width, fill and opacity pickers from the style being shown. */
  private syncPickers(): void {
    const style = this.pickerStyle();
    const parts = parseColor(style.color);
    const alpha = $<HTMLInputElement>('stroke-alpha-range');
    alpha.value = String(Math.round(parts.alpha * 100));
    $('stroke-alpha-value').textContent = `${alpha.value}%`;
    $<HTMLInputElement>('stroke-color').value = parts.hex;
    const fill = $<HTMLInputElement>('fill-color');
    const fillNone = $<HTMLInputElement>('fill-none');
    fill.value = style.fill ?? fill.value;
    fillNone.checked = !style.fill;
    fill.disabled = fillNone.checked;
    const opacity = $<HTMLInputElement>('stroke-opacity');
    opacity.value = String(Math.round(opacityOf(style) * 100));
    $('stroke-opacity-out').textContent = `${opacity.value}%`;
    this.syncVisibility(style);
  }

  /** Hide rows that do nothing for the current style: miter limit without mitred corners, paint and pattern without a fill. */
  private syncVisibility(style: Style): void {
    $('row-miter').hidden = (style.join ?? 'round') !== 'miter';
    $('row-paint').hidden = !style.fill && !style.fillGradient;
    $('row-pattern').hidden = !style.fill && !style.fillGradient;
  }

  render(): void {
    document.querySelectorAll<HTMLButtonElement>('#tools button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === this.editor.tool);
    });
    this.syncPickers();
    $<HTMLSelectElement>('fill-paint').value = this.editor.style.fillGradient?.type ?? 'solid';
    $<HTMLSelectElement>('select-mode').value = this.editor.selectMode;
    $('tool-help').textContent = this.editor.tool === 'select' ? SELECT_HELP[this.editor.selectMode] : TOOL_HELP[this.editor.tool];
    $<HTMLButtonElement>('edge-apply').disabled = !this.editor.edgePending;
    $<HTMLButtonElement>('edge-cancel').disabled = !this.editor.edgePending;
    const has = this.active().selection.size > 0;
    // Actions that cannot apply right now are hidden, not greyed out.
    $<HTMLButtonElement>('act-copy').hidden = !has;
    $<HTMLButtonElement>('act-delete').hidden = !has;
    $<HTMLButtonElement>('act-paste').hidden = this.editor.clipboard.length === 0;
  }
}
