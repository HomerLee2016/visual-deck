import type { ViewAids } from '../model';
import { $, type ActiveWorkspace } from './dom';

/** Grid, snapping and guide controls. These change the view only, so they are not history steps. */
export class GridPanel {
  private show = $<HTMLInputElement>('grid-show');
  private snap = $<HTMLInputElement>('grid-snap');
  private size = $<HTMLInputElement>('grid-size');

  constructor(private active: ActiveWorkspace) {
    this.show.onchange = () => this.set({ showGrid: this.show.checked });
    this.snap.onchange = () => this.set({ snap: this.snap.checked });
    this.size.onchange = () => {
      const n = Math.min(512, Math.max(1, Math.round(Number(this.size.value)) || 16));
      this.size.value = String(n);
      this.set({ gridSize: n });
    };
    $('guides-clear').onclick = () => this.set({ guides: { x: [], y: [] } });
  }

  render(): void {
    const a = this.active().aids;
    this.show.checked = a.showGrid;
    this.snap.checked = a.snap;
    this.size.value = String(a.gridSize);
  }

  private set(patch: Partial<ViewAids>): void {
    const ws = this.active();
    ws.aids = { ...ws.aids, ...patch };
    ws.changed();
  }
}
