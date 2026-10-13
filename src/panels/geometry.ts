import type { Editor } from '../editor';
import type { Rect } from '../math';
import { angleOfMatrix, centerOf, rotateMatrix, scaleMatrix } from '../handles';
import { transformItem } from '../geometry';
import { translation } from '../matrix';
import { mapItems } from '../model';
import { $, type ActiveWorkspace } from './dom';

type Field = 'x' | 'y' | 'w' | 'h' | 'rot';

const ROUND = (v: number) => String(Math.round(v * 100) / 100);

/** Numeric x, y, width, height and rotation of the selection's bounding box. Each change is one history step. */
export class GeometryPanel {
  private inputs: Record<Field, HTMLInputElement> = {
    x: $<HTMLInputElement>('geo-x'),
    y: $<HTMLInputElement>('geo-y'),
    w: $<HTMLInputElement>('geo-w'),
    h: $<HTMLInputElement>('geo-h'),
    rot: $<HTMLInputElement>('geo-rot'),
  };

  constructor(
    private editor: Editor,
    private active: ActiveWorkspace,
  ) {
    for (const f of Object.keys(this.inputs) as Field[]) this.inputs[f].onchange = () => this.apply(f);
  }

  render(): void {
    const box = this.editor.selectionBox();
    for (const f of Object.keys(this.inputs) as Field[]) {
      this.inputs[f].disabled = !box;
      this.inputs[f].value = box ? ROUND(this.valueOf(f, box)) : '';
    }
  }

  /** The current value of a field for the selection's box. */
  private valueOf(field: Field, box: Rect): number {
    if (field === 'rot') {
      const items = this.active().selectedItems(true);
      return items.length === 1 ? (angleOfMatrix(items[0].transform) * 180) / Math.PI : 0;
    }
    return box[field === 'x' ? 'x' : field === 'y' ? 'y' : field === 'w' ? 'w' : 'h'];
  }

  private apply(field: Field): void {
    const ws = this.active();
    const box = this.editor.selectionBox();
    const input = this.inputs[field];
    const v = Number(input.value);
    if (!box || !Number.isFinite(v)) {
      this.render();
      return;
    }
    // Blur re-fires the change event; re-applying the same value must not add a history step.
    if (Math.abs(v - this.valueOf(field, box)) < 0.005) {
      this.render();
      return;
    }
    const ids = new Set(ws.selectedItems(true).map((it) => it.id));
    let m;
    let label;
    if (field === 'x' || field === 'y') {
      m = translation(field === 'x' ? v - box.x : 0, field === 'y' ? v - box.y : 0);
      label = `Set ${field.toUpperCase()}`;
    } else if (field === 'w' || field === 'h') {
      if (v <= 0) {
        this.render();
        return;
      }
      // Dragging the east or south edge to the requested size keeps the opposite edge where it is.
      m = field === 'w' ? scaleMatrix(box, 'e', { x: box.x + v, y: box.y }) : scaleMatrix(box, 's', { x: box.x, y: box.y + v });
      label = field === 'w' ? 'Set width' : 'Set height';
    } else {
      const current = this.valueOf('rot', box);
      m = rotateMatrix(centerOf(box), ((v - current) * Math.PI) / 180);
      label = 'Rotate';
    }
    const matrix = m;
    ws.edit(label, (s) => mapItems(s, ids, (it) => transformItem(it, matrix)));
  }
}
