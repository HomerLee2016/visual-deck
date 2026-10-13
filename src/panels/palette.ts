import type { Editor } from '../editor';
import { $, type ActiveWorkspace } from './dom';

/** Saved colours for the workspace. Clicking one applies it to the selection; that is a style change, not a palette change. */
export class PalettePanel {
  constructor(
    private editor: Editor,
    private active: ActiveWorkspace,
  ) {
    $('swatch-add').onclick = () => {
      const ws = this.active();
      const c = this.editor.style.color;
      if (ws.palette.includes(c)) return;
      ws.palette = [...ws.palette, c];
      ws.changed();
    };
  }

  render(): void {
    const box = $('swatches');
    const ws = this.active();
    box.replaceChildren(
      ...ws.palette.map((c) => {
        const b = document.createElement('button');
        b.className = 'swatch';
        b.style.background = c;
        b.title = `${c} (click: stroke, Alt-click: fill, right-click: remove)`;
        b.onclick = (e) => {
          if (e.altKey) this.editor.setStyle({ fill: c }, true);
          else this.editor.setStyle({ color: c }, true);
          this.editor.onUiChange();
        };
        b.oncontextmenu = (e) => {
          e.preventDefault();
          ws.palette = ws.palette.filter((x) => x !== c);
          ws.changed();
        };
        return b;
      }),
    );
  }
}
