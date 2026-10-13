import { alignItems, distributeItems, flipItems, reorderItems, type AlignTo, type Axis, type Order } from '../arrange';
import type { Workspace } from '../model';
import type { ActiveWorkspace } from './dom';

/** Align, distribute, flip and stacking-order buttons for the selection. Each click is one history step. */
export class ArrangePanel {
  private buttons = [...document.querySelectorAll<HTMLButtonElement>('#arrange button')];

  constructor(private active: ActiveWorkspace) {
    for (const b of this.buttons) {
      b.onclick = () => this.run(b);
    }
  }

  render(): void {
    const n = this.active().selection.size;
    for (const b of this.buttons) {
      const min = b.dataset.align || b.dataset.distribute ? (b.dataset.distribute ? 3 : 2) : 1;
      b.disabled = n < min;
    }
  }

  private run(b: HTMLButtonElement): void {
    const ws: Workspace = this.active();
    const ids = new Set(ws.selectedItems(true).map((it) => it.id));
    if (ids.size === 0) return;
    if (b.dataset.align) {
      const to = b.dataset.align as AlignTo;
      ws.edit(`Align ${b.textContent?.toLowerCase()}`, (s) => alignItems(s, ids, to));
    } else if (b.dataset.distribute) {
      const axis = b.dataset.distribute as Axis;
      ws.edit(`Space ${axis.toUpperCase()}`, (s) => distributeItems(s, ids, axis));
    } else if (b.dataset.flip) {
      const axis = b.dataset.flip as Axis;
      ws.edit(`Flip ${axis.toUpperCase()}`, (s) => flipItems(s, ids, axis));
    } else if (b.dataset.order) {
      const order = b.dataset.order as Order;
      ws.edit(`Arrange: ${b.textContent}`, (s) => reorderItems(s, ids, order));
    }
  }
}
