import type { Workspace } from '../model';
import { $ } from './dom';

/** What the tab bar needs from the app; it owns the DOM, the app owns the workspaces. */
export interface TabBarHost {
  workspaces(): readonly Workspace[];
  active(): Workspace;
  activate(ws: Workspace): void;
  close(ws: Workspace): void;
  create(name: string, width: number, height: number): void;
}

const MAX_SIZE = 8192;
const DEFAULT_SIZE = 512;

/** Workspace tabs and the "new workspace" dialog. */
export class TabBar {
  constructor(private host: TabBarHost) {
    const dlg = $<HTMLDialogElement>('new-dialog');
    $('new-tab').onclick = () => {
      $<HTMLInputElement>('new-name').value = `Untitled ${host.workspaces().length + 1}`;
      dlg.showModal();
    };
    $('new-cancel').onclick = () => dlg.close();
    $<HTMLFormElement>('new-form').onsubmit = () => {
      const clamp = (v: string) => Math.min(MAX_SIZE, Math.max(1, Math.round(Number(v)) || DEFAULT_SIZE));
      const name = $<HTMLInputElement>('new-name').value.trim() || 'Untitled';
      host.create(name, clamp($<HTMLInputElement>('new-w').value), clamp($<HTMLInputElement>('new-h').value));
    };
  }

  render(): void {
    const box = $('tabs');
    box.replaceChildren();
    const active = this.host.active();
    for (const ws of this.host.workspaces()) {
      const tab = document.createElement('div');
      tab.className = 'tab' + (ws === active ? ' active' : '');
      const label = document.createElement('span');
      label.textContent = (ws.dirty ? '● ' : '') + ws.name;
      if (ws.dirty) label.title = 'Unsaved changes';
      const close = document.createElement('button');
      close.className = 'close';
      close.textContent = '×';
      close.title = 'Close workspace';
      close.onclick = (e) => {
        e.stopPropagation();
        this.host.close(ws);
      };
      tab.append(label, close);
      tab.onclick = () => ws !== active && this.host.activate(ws);
      tab.ondblclick = () => {
        const name = prompt('Rename workspace', ws.name)?.trim();
        if (name) {
          ws.name = name;
          this.render();
        }
      };
      box.append(tab);
    }
  }
}
