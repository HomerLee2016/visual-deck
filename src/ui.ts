import './style.css';
import { Editor, type ToolId } from './editor';
import { download, exportDocument, fileToCanvas, isImageFile, type ExportFormat } from './io';
import { Workspace, imageItem, newLayer, uid } from './model';
import { thumbnail } from './render';
import { API_HELP, loadScripts, runScript, saveScripts, type ScriptDef } from './scripting';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const TOOL_HELP: Record<ToolId, string> = {
  select: 'Click or drag a box to select across all visible layers. Shift adds. Drag to move. Delete / Ctrl+C / Ctrl+V.',
  line: 'Press-drag-release, or click start then click end.',
  arc: 'Drag start→end (or click twice), then click a point the arc passes through.',
  curve: 'Drag start→end (or click twice), then click two control points.',
};

export class App {
  private workspaces: Workspace[] = [];
  private active!: Workspace;
  private editor: Editor;
  private scripts: ScriptDef[] = loadScripts();
  private unsub: (() => void) | null = null;
  private editingScript: ScriptDef | null = null;

  constructor() {
    this.editor = new Editor($<HTMLCanvasElement>('view'));
    this.editor.onStatus = (m) => ($('status').textContent = m);
    this.editor.onUiChange = () => this.renderTools();
    this.editor.onImageFile = (f) => void this.pasteImage(f);

    this.bindToolbox();
    this.bindMenubar();
    this.bindTabbar();
    this.bindLayerButtons();
    this.bindScriptDialog();
    this.bindFileDrop();
    this.renderScripts();

    window.addEventListener('beforeunload', (e) => {
      if (this.workspaces.some((w) => w.index > 0)) e.preventDefault();
    });

    this.addWorkspace(this.newWorkspace('Untitled', 512, 512));
  }

  // ---- workspaces -----------------------------------------------------------

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
      this.renderHistory();
      this.renderLayers();
      this.renderTools();
    });
    this.editor.setWorkspace(ws);
    this.renderTabs();
    this.renderHistory();
    this.renderLayers();
  }

  private closeWorkspace(ws: Workspace): void {
    if (ws.index > 0 && !confirm(`Close "${ws.name}"? Its edit history will be lost.`)) return;
    const i = this.workspaces.indexOf(ws);
    this.workspaces.splice(i, 1);
    if (this.workspaces.length === 0) this.addWorkspace(this.newWorkspace('Untitled', 512, 512));
    else if (ws === this.active) this.activate(this.workspaces[Math.max(0, i - 1)]);
    else this.renderTabs();
  }

  /** Import: each image file becomes its own workspace tab. */
  private importFile(file: File): void {
    if (!isImageFile(file)) {
      this.editor.onStatus(`${file.name} is not an image`);
      return;
    }
    void this.openImage(file);
  }

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

  // ---- tab bar ----------------------------------------------------------------

  private bindTabbar(): void {
    const dlg = $<HTMLDialogElement>('new-dialog');
    $('new-tab').onclick = () => {
      $<HTMLInputElement>('new-name').value = `Untitled ${this.workspaces.length + 1}`;
      dlg.showModal();
    };
    $('new-cancel').onclick = () => dlg.close();
    $<HTMLFormElement>('new-form').onsubmit = () => {
      const clamp = (v: string) => Math.min(8192, Math.max(1, Math.round(Number(v)) || 512));
      const name = $<HTMLInputElement>('new-name').value.trim() || 'Untitled';
      this.addWorkspace(this.newWorkspace(name, clamp($<HTMLInputElement>('new-w').value), clamp($<HTMLInputElement>('new-h').value)));
    };
  }

  // ---- menu bar (File > Import / Export) ------------------------------------------

  private bindMenubar(): void {
    const menu = document.querySelector<HTMLElement>('#menubar .menu')!;
    const items = menu.querySelector<HTMLElement>('.menu-items')!;
    const title = menu.querySelector<HTMLElement>('.menu-title')!;
    const closeMenu = () => (items.hidden = true);
    title.onclick = () => (items.hidden = !items.hidden);
    document.addEventListener('pointerdown', (e) => {
      if (!menu.contains(e.target as Node)) closeMenu();
    });

    const input = $<HTMLInputElement>('file-input');
    $('menu-import').onclick = () => {
      closeMenu();
      input.click();
    };
    input.onchange = () => {
      for (const f of Array.from(input.files ?? [])) this.importFile(f);
      input.value = '';
    };

    const dlg = $<HTMLDialogElement>('export-dialog');
    $('menu-export').onclick = () => {
      closeMenu();
      dlg.showModal();
    };
    $('export-cancel').onclick = () => dlg.close();
    $<HTMLFormElement>('export-form').onsubmit = () => {
      const data = new FormData($<HTMLFormElement>('export-form'));
      const format = (data.get('format') as ExportFormat | null) ?? 'png';
      const ws = this.active;
      exportDocument(ws.state, format)
        .then((blob) => download(blob, `${ws.name}.${format}`))
        .catch(() => this.editor.onStatus(`Could not export ${ws.name}`));
    };
  }

  private renderTabs(): void {
    const box = $('tabs');
    box.replaceChildren();
    for (const ws of this.workspaces) {
      const tab = document.createElement('div');
      tab.className = 'tab' + (ws === this.active ? ' active' : '');
      const label = document.createElement('span');
      label.textContent = ws.name;
      const close = document.createElement('button');
      close.className = 'close';
      close.textContent = '×';
      close.title = 'Close workspace';
      close.onclick = (e) => {
        e.stopPropagation();
        this.closeWorkspace(ws);
      };
      tab.append(label, close);
      tab.onclick = () => ws !== this.active && this.activate(ws);
      tab.ondblclick = () => {
        const name = prompt('Rename workspace', ws.name)?.trim();
        if (name) {
          ws.name = name;
          this.renderTabs();
        }
      };
      box.append(tab);
    }
  }

  // ---- history panel ------------------------------------------------------------

  private renderHistory(): void {
    const ws = this.active;
    const list = $('history');
    list.replaceChildren();
    ws.history.forEach((h, i) => {
      const li = document.createElement('li');
      li.className = i === ws.index ? 'current' : i > ws.index ? 'future' : '';
      if (h.thumb) {
        const img = document.createElement('img');
        img.src = h.thumb;
        img.alt = '';
        li.append(img);
      } else {
        li.append(Object.assign(document.createElement('div'), { className: 'nothumb' }));
      }
      const text = document.createElement('div');
      text.innerHTML = '<div></div><div class="step"></div>';
      (text.children[0] as HTMLElement).textContent = h.label;
      (text.children[1] as HTMLElement).textContent = `Step ${i}`;
      li.append(text);
      li.onclick = () => ws.jump(i);
      list.append(li);
    });
    list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }

  // ---- layers panel ---------------------------------------------------------------

  private renderLayers(): void {
    const ws = this.active;
    const list = $('layers');
    list.replaceChildren();
    // Top of the stack first.
    for (const layer of [...ws.state.layers].reverse()) {
      const li = document.createElement('li');
      li.className = layer.id === ws.activeLayer.id ? 'active' : '';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = layer.visible;
      cb.title = 'Visible';
      cb.onclick = (e) => e.stopPropagation();
      cb.onchange = () => ws.setLayerVisible(layer.id, cb.checked);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = layer.name;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = String(layer.items.length);
      li.append(cb, name, count);
      li.onclick = () => {
        ws.activeLayerId = layer.id;
        this.renderLayers();
      };
      li.ondblclick = () => {
        const n = prompt('Rename layer', layer.name)?.trim();
        if (n) ws.renameLayer(layer.id, n);
      };
      list.append(li);
    }
  }

  private bindLayerButtons(): void {
    $('layer-add').onclick = () => this.active.addLayer('Add layer');
    $('layer-up').onclick = () => this.active.moveLayer(this.active.activeLayer.id, 1);
    $('layer-down').onclick = () => this.active.moveLayer(this.active.activeLayer.id, -1);
    $('layer-del').onclick = () => this.active.removeLayer(this.active.activeLayer.id);
  }

  // ---- toolbox --------------------------------------------------------------------

  private bindToolbox(): void {
    document.querySelectorAll<HTMLButtonElement>('#tools button').forEach((b) => {
      b.onclick = () => this.editor.setTool(b.dataset.tool as ToolId);
    });
    const color = $<HTMLInputElement>('stroke-color');
    const width = $<HTMLInputElement>('stroke-width');
    color.oninput = () => this.editor.setStyle({ color: color.value });
    color.onchange = () => this.editor.setStyle({ color: color.value }, true);
    width.onchange = () => {
      const w = Math.min(64, Math.max(1, Number(width.value) || 1));
      width.value = String(w);
      this.editor.setStyle({ width: w }, true);
    };
    $('act-copy').onclick = () => this.editor.copy();
    $('act-paste').onclick = () => this.editor.pasteClipboard();
    $('act-delete').onclick = () => this.editor.deleteSelection();
  }

  private renderTools(): void {
    document.querySelectorAll<HTMLButtonElement>('#tools button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === this.editor.tool);
    });
    $('tool-help').textContent = TOOL_HELP[this.editor.tool];
    const has = this.active.selection.size > 0;
    $<HTMLButtonElement>('act-copy').disabled = !has;
    $<HTMLButtonElement>('act-delete').disabled = !has;
    $<HTMLButtonElement>('act-paste').disabled = this.editor.clipboard.length === 0;
  }

  // ---- scripts -----------------------------------------------------------------------

  private renderScripts(): void {
    const box = $('scripts');
    box.replaceChildren();
    for (const def of this.scripts) {
      const row = document.createElement('div');
      row.className = 'script-btn';
      const run = document.createElement('button');
      run.className = 'run';
      run.textContent = def.name;
      run.title = 'Run script';
      run.onclick = () => void runScript(def, this.active, (m) => this.editor.onStatus(m));
      const edit = document.createElement('button');
      edit.className = 'edit';
      edit.textContent = '✎';
      edit.title = 'Edit script';
      edit.onclick = () => this.openScriptDialog(def);
      row.append(run, edit);
      box.append(row);
    }
  }

  private bindScriptDialog(): void {
    const dlg = $<HTMLDialogElement>('script-dialog');
    const name = $<HTMLInputElement>('script-name');
    const code = $<HTMLTextAreaElement>('script-code');
    $('script-help').textContent = API_HELP;
    $('script-add').onclick = () => this.openScriptDialog(null);
    $('script-cancel').onclick = () => dlg.close();
    code.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      code.setRangeText('  ', code.selectionStart, code.selectionEnd, 'end');
    });
    const save = (): ScriptDef | null => {
      if (!name.value.trim()) {
        name.reportValidity();
        return null;
      }
      const def = this.editingScript ?? { id: uid('script'), name: '', code: '' };
      def.name = name.value.trim();
      def.code = code.value;
      if (!this.scripts.includes(def)) this.scripts.push(def);
      saveScripts(this.scripts);
      this.renderScripts();
      return def;
    };
    $<HTMLFormElement>('script-form').onsubmit = (e) => {
      if (!save()) e.preventDefault();
    };
    $('script-run').onclick = () => {
      const def = save();
      if (!def) return;
      dlg.close();
      void runScript(def, this.active, (m) => this.editor.onStatus(m));
    };
    $('script-delete').onclick = () => {
      if (!this.editingScript || !confirm(`Delete script "${this.editingScript.name}"?`)) return;
      this.scripts = this.scripts.filter((s) => s !== this.editingScript);
      saveScripts(this.scripts);
      this.renderScripts();
      dlg.close();
    };
  }

  private openScriptDialog(def: ScriptDef | null): void {
    this.editingScript = def;
    $<HTMLInputElement>('script-name').value = def?.name ?? 'My script';
    $<HTMLTextAreaElement>('script-code').value =
      def?.code ?? '// Runs when you click the button. See "API reference" below.\nconst img = deck.getImageData();\ndeck.log(img.width + "x" + img.height);\n';
    $('script-delete').style.display = def ? '' : 'none';
    $<HTMLDialogElement>('script-dialog').showModal();
  }

  // ---- drag & drop ---------------------------------------------------------------------

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
      for (const f of Array.from(e.dataTransfer?.files ?? [])) this.importFile(f);
    });
  }
}
