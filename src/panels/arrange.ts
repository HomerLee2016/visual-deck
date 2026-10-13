import { alignItems, clipItems, distributeItems, flipItems, releaseClip, reorderItems, type AlignTo, type Axis, type Order } from '../arrange';
import { reversePath, simplifyBrush, toPath } from '../convert';
import { offsetPath, outlineItem } from '../outline';
import { shareStyle, unshareStyle } from '../shared';
import type { Editor } from '../editor';
import { mapItems, type Workspace } from '../model';
import { arrangeActions } from '../options';
import { selectionContext } from './options';
import { $, type ActiveWorkspace } from './dom';

/** The `data-*` keys that name an Arrange action (see `arrangeActions`). */
const ACTION_KEYS = ['align', 'distribute', 'flip', 'order', 'group', 'ungroup', 'convert', 'reverse', 'simplify', 'outline', 'offset', 'share', 'unshare', 'clip', 'release'];

/** Align, distribute, flip and stacking-order buttons for the selection. Each click is one history step. */
export class ArrangePanel {
  private buttons = [...document.querySelectorAll<HTMLButtonElement>('#arrange button')];

  constructor(
    private editor: Editor,
    private active: ActiveWorkspace,
  ) {
    for (const b of this.buttons) {
      b.onclick = () => this.run(b);
    }
  }

  render(): void {
    const useful = arrangeActions(selectionContext(this.active(), this.editor.clipboard.length));
    // Buttons that cannot apply to the selection are hidden, not greyed out.
    for (const b of this.buttons) b.hidden = !useful.has(ACTION_KEYS.find((k) => k in b.dataset) ?? '');
    $('offset-field').hidden = !useful.has('offset');
  }

  private run(b: HTMLButtonElement): void {
    const ws: Workspace = this.active();
    const ids = new Set(ws.selectedItems(true).map((it) => it.id));
    if (ids.size === 0) return;
    if (b.dataset.group) this.editor.groupSelection();
    else if (b.dataset.ungroup) this.editor.ungroupSelection();
    else if (b.dataset.align) {
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
    } else if (b.dataset.convert) {
      ws.edit('To path', (s) => mapItems(s, ids, (it) => toPath(it, it.id) ?? it));
    } else if (b.dataset.reverse) {
      ws.edit('Reverse path', (s) => mapItems(s, ids, (it) => (it.kind === 'path' ? reversePath(it) : it)));
    } else if (b.dataset.share) {
      const which = b.dataset.share as 'fill' | 'stroke';
      ws.edit(`Share ${which}`, (s) => shareStyle(s, ids, which));
    } else if (b.dataset.unshare) {
      ws.edit('Unshare', (s) => unshareStyle(s, ids));
    } else if (b.dataset.clip) {
      const mode = b.dataset.clip as 'clip' | 'mask';
      ws.edit(mode === 'clip' ? 'Clip' : 'Mask', (s) => clipItems(s, ids, mode));
    } else if (b.dataset.release) {
      ws.edit('Release clip', (s) => releaseClip(s, ids));
    } else if (b.dataset.outline) {
      ws.edit('Outline stroke', (s) => mapItems(s, ids, (it) => outlineItem(it) ?? it));
    } else if (b.dataset.offset) {
      const d = Number($<HTMLInputElement>('offset-dist').value) || 0;
      ws.edit('Offset path', (s) => mapItems(s, ids, (it) => {
        const p = toPath(it, it.id);
        return p && d !== 0 ? offsetPath(p, d) : it;
      }));
    } else if (b.dataset.simplify) {
      // Strokes keep their shape within one document unit; fewer nodes is the point.
      ws.edit('Simplify', (s) =>
        mapItems(s, ids, (it) => (it.kind === 'brush' ? simplifyBrush(it.pts, it.style, it.id, 1, it.transform) : it)),
      );
    }
  }
}
