import './style.css';
import { Editor, type TextRequest } from './editor';
import { fileToCanvas, fileToProject, download, domCodec, projectToBlob } from './io';
import { AUTOSAVE_KEY, parseSession, serializeSession } from './autosave';
import { resizeDocument } from './arrange';
import { importSvg } from './svgimport';
import { CodePanel } from './panels/code';
import { Workspace, imageItem, mapItems, newLayer, removeItems, uid } from './model';
import { $ } from './panels/dom';
import { PROJECT_EXT, type Project } from './project';
import { HistoryPanel } from './panels/history';
import { LayersPanel } from './panels/layers';
import { MenuBar } from './panels/menubar';
import { ArrangePanel } from './panels/arrange';
import { GridPanel } from './panels/grid';
import { PalettePanel } from './panels/palette';
import { SymbolsPanel } from './panels/symbols';
import { GeometryPanel } from './panels/geometry';
import { ScriptsPanel } from './panels/scripts';
import { TextInput } from './panels/textinput';
import { TabBar } from './panels/tabbar';
import { ToolboxPanel } from './panels/toolbox';
import { OptionsPanel } from './panels/options';
import { thumbnail } from './render';
import { CollapsibleSections } from './panels/collapsible';
import { SidebarResizer } from './panels/resizer';

/** Owns the open workspaces and wires the editor to the panels. */
export class App {
  private workspaces: Workspace[] = [];
  private active!: Workspace;
  private unsub: (() => void) | null = null;
  /** True until the autosaved session has been read, so the placeholder tab is not written over it. */
  private restoring = true;
  private autosaveTimer = 0;
  private editor = new Editor($<HTMLCanvasElement>('view'));
  private textInput = new TextInput($<HTMLCanvasElement>('view'), (req, text) => this.commitText(req, text));
  private history = new HistoryPanel(() => this.active);
  private layers = new LayersPanel(() => this.active);
  private toolbox = new ToolboxPanel(this.editor, () => this.active);
  private options = new OptionsPanel(this.editor, () => this.active);
  private scripts = new ScriptsPanel(this.editor, () => this.active, (m) => this.editor.onStatus(m));
  private geometry = new GeometryPanel(this.editor, () => this.active);
  private arrange = new ArrangePanel(this.editor, () => this.active);
  private grid = new GridPanel(() => this.active);
  private palette = new PalettePanel(this.editor, () => this.active);
  private symbols = new SymbolsPanel(() => this.active);
  private menu = new MenuBar(
    () => this.active,
    (f) => void this.openImage(f),
    (f) => void this.openProject(f),
    () => this.saveProject(),
    (m) => this.editor.onStatus(m),
    (w, h, ax, ay) => this.resizeDocument(w, h, ax, ay),
    (f) => void this.openSvgShapes(f),
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
    this.editor.onUiChange = () => {
      this.toolbox.render();
      this.options.render();
      this.scripts.renderMask();
      this.geometry.render();
      this.arrange.render();
    };
    this.editor.onImageFile = (f) => void this.pasteImage(f);
    this.editor.onText = (req) => this.textInput.open(req, this.editor.textStyle, this.editor.style.color);
    new CodePanel(() => this.active);
    new SidebarResizer();
    new CollapsibleSections();

    this.bindFileDrop();
    window.addEventListener('beforeunload', (e) => {
      this.writeAutosave();
      if (this.workspaces.some((w) => w.dirty)) e.preventDefault();
    });

    this.addWorkspace(this.newWorkspace('Untitled', 512, 512));
    void this.restoreSession();
  }

  /** Keep the open tabs in browser storage, a moment after the last change. */
  private scheduleAutosave(): void {
    if (this.restoring) return;
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => this.writeAutosave(), 500);
  }

  private writeAutosave(): void {
    if (this.restoring) return;
    clearTimeout(this.autosaveTimer);
    try {
      const text = serializeSession(this.workspaces, this.workspaces.indexOf(this.active), domCodec);
      localStorage.setItem(AUTOSAVE_KEY, text);
    } catch {
      this.editor.onStatus('Autosave failed: browser storage is full or blocked');
    }
  }

  /** Reopen the tabs from the last session. Replaces the placeholder tab only if it is untouched. */
  private async restoreSession(): Promise<void> {
    try {
      const text = localStorage.getItem(AUTOSAVE_KEY);
      if (text) {
        const { projects, active } = await parseSession(text, domCodec);
        if (this.workspaces.length === 1 && !this.workspaces[0].dirty) this.workspaces.length = 0;
        for (const p of projects) this.workspaces.push(this.workspaceFromProject(p));
        this.activate(this.workspaces[active]);
        this.editor.onStatus(`Restored ${projects.length} autosaved tab${projects.length === 1 ? '' : 's'}`);
      }
    } catch {
      this.editor.onStatus('Could not restore the autosaved session');
    } finally {
      this.restoring = false;
      this.scheduleAutosave();
    }
  }

  private workspaceFromProject(p: Project): Workspace {
    const { width, height } = p.history[0].state;
    const ws = this.newWorkspace(p.name, width, height);
    ws.restore(p.history, p.index, p.activeLayerId, p.view, p.palette);
    return ws;
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
      this.scheduleAutosave();
      this.tabs.render();
      this.history.render();
      this.layers.render();
      this.toolbox.render();
      this.geometry.render();
      this.arrange.render();
      this.grid.render();
      this.palette.render();
      this.symbols.render();
    });
    this.editor.setWorkspace(ws);
    this.tabs.render();
    this.history.render();
    this.layers.render();
    this.grid.render();
    this.palette.render();
    this.symbols.render();
    this.scheduleAutosave();
  }

  private closeWorkspace(ws: Workspace): void {
    if (ws.dirty && !confirm(`"${ws.name}" has unsaved changes. Close it anyway?`)) return;
    const i = this.workspaces.indexOf(ws);
    this.workspaces.splice(i, 1);
    if (this.workspaces.length === 0) this.addWorkspace(this.newWorkspace('Untitled', 512, 512));
    else if (ws === this.active) this.activate(this.workspaces[Math.max(0, i - 1)]);
    else this.tabs.render();
    this.scheduleAutosave();
  }

  /** Save the active workspace (document, history, view) as a .vdeck file. */
  private saveProject(): void {
    const ws = this.active;
    try {
      download(projectToBlob(ws), `${ws.name}${PROJECT_EXT}`);
      ws.markSaved();
      this.editor.onStatus(`Saved ${ws.name}${PROJECT_EXT}`);
    } catch {
      this.editor.onStatus(`Could not save ${ws.name}`);
    }
  }

  /** Open a saved project in a new tab, restoring its history and view. */
  private async openProject(file: File): Promise<void> {
    try {
      this.addWorkspace(this.workspaceFromProject(await fileToProject(file)));
    } catch (e) {
      this.editor.onStatus(`Could not open ${file.name}: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  /** An SVG opened as editable shapes: a new workspace whose unsupported features are reported in the status line. */
  private async openSvgShapes(file: File): Promise<void> {
    try {
      const r = importSvg(await file.text());
      const layer = newLayer('Imported', r.items);
      this.addWorkspace(this.newWorkspace(file.name.replace(/\.[^.]+$/, ''), r.width, r.height, [layer]));
      const note = r.warnings.length ? ` – ${r.warnings.length} not imported: ${r.warnings.slice(0, 3).join('; ')}` : '';
      this.editor.onStatus(`Opened ${file.name} as shapes${note}`);
    } catch (e) {
      this.editor.onStatus(`Could not open ${file.name}: ${(e as Error).message}`);
    }
  }

  /** Change the document size as one history step, anchored as chosen, and fit the view to the new size. */
  private resizeDocument(width: number, height: number, anchorX: 0 | 1 | 2, anchorY: 0 | 1 | 2): void {
    const ws = this.active;
    ws.edit('Document size', (s) => resizeDocument(s, width, height, anchorX, anchorY));
    ws.view = { ...ws.view, fitted: false };
    this.editor.fit();
  }

  /** A typed text block is added to the workspace it was started in; an empty edit removes the text. */
  private commitText(req: TextRequest, text: string): void {
    const { ws } = req;
    const value = text.replace(/\s+$/, '');
    if (req.item) {
      const ids = new Set([req.item.id]);
      if (!value.trim()) {
        ws.selection.delete(req.item.id);
        ws.edit('Delete text', (s) => removeItems(s, ids));
      } else {
        ws.edit('Edit text', (s) => mapItems(s, ids, (it) => (it.kind === 'text' ? { ...it, text: value } : it)));
      }
      return;
    }
    if (!value.trim()) return;
    ws.addItem('Text', {
      kind: 'text',
      id: uid('item'),
      x: req.at.x,
      y: req.at.y,
      text: value,
      ...this.editor.textStyle,
      style: { ...this.editor.style },
    });
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
