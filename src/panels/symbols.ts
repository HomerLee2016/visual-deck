import { makeSymbol, newSymbolId, placeInstance } from '../symbols';
import { uid } from '../model';
import { $, type ActiveWorkspace } from './dom';

/** Symbols in the document: make one from the selection, or place another instance of one. */
export class SymbolsPanel {
  constructor(private active: ActiveWorkspace) {
    $('symbol-make').onclick = () => {
      const ws = this.active();
      const ids = new Set(ws.selectedItems(true).map((it) => it.id));
      if (ids.size === 0) return;
      ws.edit('Make symbol', (s) => makeSymbol(s, ids, newSymbolId(s)));
    };
  }

  render(): void {
    const ws = this.active();
    const list = $('symbol-list');
    const ids = Object.keys(ws.state.symbols ?? {});
    list.replaceChildren(
      ...ids.map((id) => {
        const b = document.createElement('button');
        b.textContent = `Place ${id}`;
        b.title = 'Place an instance at the centre of the document';
        b.onclick = () => {
          const { width, height } = ws.state;
          ws.edit('Place instance', (s) => placeInstance(s, id, width / 2, height / 2, ws.activeLayerId, uid('item')));
        };
        return b;
      }),
    );
  }
}
