import { $ } from './dom';

/**
 * The warning shown when a Modify mask session would be left (a script runs, another tab or file is opened, undo).
 * Save and Discard each carry on with the action that was asked for; Keep editing does nothing.
 */
export class MaskPrompt {
  private pending: { save: () => void; discard: () => void } | null = null;

  constructor() {
    const dlg = $<HTMLDialogElement>('mask-dialog');
    $('mask-dialog-keep').onclick = () => dlg.close();
    $('mask-dialog-discard').onclick = () => this.choose('discard');
    $('mask-dialog-save').onclick = () => this.choose('save');
    // Closing with Esc keeps editing, the same as the Keep button.
    dlg.addEventListener('close', () => (this.pending = null));
  }

  ask(save: () => void, discard: () => void): void {
    this.pending = { save, discard };
    $<HTMLDialogElement>('mask-dialog').showModal();
  }

  private choose(which: 'save' | 'discard'): void {
    const p = this.pending;
    this.pending = null;
    $<HTMLDialogElement>('mask-dialog').close();
    if (which === 'save') p?.save();
    else p?.discard();
  }
}
