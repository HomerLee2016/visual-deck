import type { Editor } from '../editor';
import { uid } from '../model';
import { API_HELP, loadScripts, runScript, saveScripts, type ScriptDef } from '../scripting';
import { $, type ActiveWorkspace } from './dom';

const NEW_SCRIPT_CODE =
  '// Runs when you click the button. See "API reference" below.\nconst img = deck.getImageData();\ndeck.log(img.width + "x" + img.height);\n';

/** The script buttons in the sidebar and the dialog for editing them. */
export class ScriptsPanel {
  private scripts: ScriptDef[] = loadScripts();
  private editing: ScriptDef | null = null;

  constructor(
    private editor: Editor,
    private active: ActiveWorkspace,
    private log: (msg: string) => void,
  ) {
    this.bindDialog();
    this.bindMask();
    this.render();
  }

  /** The Modify mask controls: which are shown depends on whether a mask session is open. */
  private bindMask(): void {
    const size = $<HTMLInputElement>('mask-size');
    const out = $('mask-size-out');
    $('mask-modify').onclick = () => this.editor.beginMaskEdit();
    $('mask-confirm').onclick = () => this.editor.confirmMaskEdit();
    $('mask-toggle').onclick = () => this.editor.setMaskVisible(!this.editor.maskVisible);
    size.oninput = () => {
      out.textContent = `${size.value}px`;
      this.editor.setMaskBrush({ radius: Number(size.value) / 2 });
    };
    document.querySelectorAll<HTMLInputElement>('input[name="mask-op"]').forEach((r) => {
      r.onchange = () => this.editor.setMaskBrush({ op: r.value as 'add' | 'remove' });
    });
  }

  /** Refresh the mask controls from the editor and the active workspace. */
  renderMask(): void {
    const editing = this.editor.maskEditing;
    const visible = this.editor.maskVisible;
    $<HTMLButtonElement>('mask-modify').disabled = editing;
    $('mask-edit').hidden = !editing;
    document.querySelectorAll<HTMLInputElement>('input[name="mask-op"]').forEach((r) => {
      r.checked = r.value === this.editor.maskOp;
    });
    const toggle = $<HTMLButtonElement>('mask-toggle');
    // The icon shows the state: eye while the mask is shown, ban while it is hidden.
    toggle.textContent = visible ? '👁' : '🚫';
    toggle.title = visible ? 'Hide the mask' : 'Show the mask in yellow';
    toggle.setAttribute('aria-pressed', String(visible));
    // The workspace is set after the panels are built, so it may not exist yet.
    const mask = this.active?.()?.activeMask();
    const hint = !mask
      ? 'Scripts change the whole canvas.'
      : mask.data.includes(1)
        ? 'Scripts change only the masked area.'
        : 'Scripts change nothing: the mask is empty.';
    $('mask-hint').textContent = hint;
  }

  render(): void {
    const box = $('scripts');
    box.replaceChildren();
    for (const def of this.scripts) {
      const row = document.createElement('div');
      row.className = 'script-btn';
      const run = document.createElement('button');
      run.className = 'run';
      run.textContent = def.name;
      run.title = 'Run script';
      run.onclick = () => this.run(def);
      const edit = document.createElement('button');
      edit.className = 'edit';
      edit.textContent = '✎';
      edit.title = 'Edit script';
      edit.onclick = () => this.openDialog(def);
      row.append(run, edit);
      box.append(row);
    }
  }

  /** Shows the loading overlay, lets it paint, then runs the script. */
  private async run(def: ScriptDef): Promise<void> {
    const overlay = $('loading');
    $('loading-text').textContent = `Running ${def.name}…`;
    overlay.hidden = false;
    // Scripts can run synchronously for a long time, so paint the overlay first.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      await runScript(def, this.active(), this.log);
    } finally {
      overlay.hidden = true;
    }
  }

  private bindDialog(): void {
    const dlg = $<HTMLDialogElement>('script-dialog');
    const name = $<HTMLInputElement>('script-name');
    const code = $<HTMLTextAreaElement>('script-code');
    $('script-help').textContent = API_HELP;
    $('script-add').onclick = () => this.openDialog(null);
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
      const def = this.editing ?? { id: uid('script'), name: '', code: '' };
      def.name = name.value.trim();
      def.code = code.value;
      if (!this.scripts.includes(def)) this.scripts.push(def);
      saveScripts(this.scripts);
      this.render();
      return def;
    };
    $<HTMLFormElement>('script-form').onsubmit = (e) => {
      if (!save()) e.preventDefault();
    };
    $('script-run').onclick = () => {
      const def = save();
      if (!def) return;
      dlg.close();
      this.run(def);
    };
    $('script-delete').onclick = () => {
      if (!this.editing || !confirm(`Delete script "${this.editing.name}"?`)) return;
      this.scripts = this.scripts.filter((s) => s !== this.editing);
      saveScripts(this.scripts);
      this.render();
      dlg.close();
    };
  }

  private openDialog(def: ScriptDef | null): void {
    this.editing = def;
    $<HTMLInputElement>('script-name').value = def?.name ?? 'My script';
    $<HTMLTextAreaElement>('script-code').value = def?.code ?? NEW_SCRIPT_CODE;
    $('script-delete').style.display = def ? '' : 'none';
    $<HTMLDialogElement>('script-dialog').showModal();
  }
}
