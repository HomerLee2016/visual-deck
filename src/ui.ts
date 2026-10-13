import './style.css';
import { Editor } from './editor';
import { fileToCanvas } from './io';
import { Workspace, imageItem, newLayer } from './model';
import { $ } from './panels/dom';
import { HistoryPanel } from './panels/history';
import { LayersPanel } from './panels/layers';
import { MenuBar } from './panels/menubar';
import { ScriptsPanel } from './panels/scripts';
import { TabBar } from './panels/tabbar';
import { ToolboxPanel } from './panels/toolbox';
import { thumbnail } from './render';

/** Owns the open workspaces and wires the editor to the panels. */
export class App {
  private workspaces: Workspace[] = [];
  private active!: Workspace;
  private unsub: (() => void) | null = null;
  private editor = new Editor($<HTMLCanvasElement>('view'));
  private history = new HistoryPanel(() => this.active);
  private layers = new LayersPanel(() => this.active);
  private toolbox = new ToolboxPanel(this.editor, () => this.active);
  private menu = new MenuBar(
    () => this.active,
    (f) => void this.openImage(f),
    (m) => this.editor.onStatus(m),
  );
  private tabs = new TabBar({
    workspaces: () => this.workspaces,
    active: () => this.active,
    activate: (ws) => this.activate(ws),
    close: (ws) => this.closeWorkspace(ws),
    create: (name, w, h) => this.addWorkspace(this.newWorkspace(name, w, h)),
  });

  constructor() {
    this.editor.onStatus = (m) => ($('status').textContent = m);
    this.editor.onUiChange = () => this.toolbox.render();
    this.editor.onImageFile = (f) => void this.pasteImage(f);
    new ScriptsPanel(() => this.active, (m) => this.editor.onStatus(m));

    this.bindFileDrop();
    window.addEventListener('beforeunload', (e) => {
      if (this.workspaces.some((w) => w.index > 0)) e.preventDefault();
    });

    this.addWorkspace(this.newWorkspace('Untitled', 512, 512));
  }

  private newWorkspace(name: string, w: number, h: number, layers = [newLayer('Layer 1')]): Workspace {
    return new Workspace(name, w, h, thumbnail, layers);
  }

  private addWorkspace(ws: Workspace): void {
    this.workspaces.push(ws);
    this.activate(ws);
  }

  private activate(ws: Workspace): void {
    this.unsub?.();
    this.active = ws;
    this.unsub = ws.subscribe(() => {
      this.history.render();
      this.layers.render();
      this.toolbox.render();
    });
    this.editor.setWorkspace(ws);
    this.tabs.render();
    this.history.render();
    this.layers.render();
  }

  private closeWorkspace(ws: Workspace): void {
    if (ws.index > 0 && !confirm(`Close "${ws.name}"? Its edit history will be lost.`)) return;
    const i = this.workspaces.indexOf(ws);
    this.workspaces.splice(i, 1);
    if (this.workspaces.length === 0) this.addWorkspace(this.newWorkspace('Untitled', 512, 512));
    else if (ws === this.active) this.activate(this.workspaces[Math.max(0, i - 1)]);
    else this.tabs.render();
  }

  /** Import: each image file becomes its own workspace tab. */
  private async openImage(file: File): Promise<void> {
    try {
      const canvas = await fileToCanvas(file);
      const layer = newLayer('Image', [imageItem(canvas)]);
      this.addWorkspace(this.newWorkspace(file.name.replace(/\.[^.]+$/, ''), canvas.width, canvas.height, [layer]));
    } catch {
      this.editor.onStatus(`Could not open ${file.name}`);
    }
  }

  private async pasteImage(file: File): Promise<void> {
    try {
      const canvas = await fileToCanvas(file);
      this.active.addLayer('Paste image', 'Pasted image', [imageItem(canvas)]);
    } catch {
      this.editor.onStatus('Could not read the pasted image');
    }
  }

  private bindFileDrop(): void {
    // dragenter/dragleave also fire for child elements, so count them.
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const setDropping = (on: boolean) => document.body.classList.toggle('dropping', on);
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      depth++;
      setDropping(true);
    });
    window.addEventListener('dragleave', () => {
      if (--depth <= 0) {
        depth = 0;
        setDropping(false);
      }
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      setDropping(false);
      for (const f of Array.from(e.dataTransfer?.files ?? [])) this.menu.import(f);
    });
  }
}
