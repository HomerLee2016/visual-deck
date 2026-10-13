import { importSvg } from '../svgimport';
import { toSvg } from '../svg';
import { resolveDefs } from '../shared';
import type { Workspace } from '../model';
import { $, type ActiveWorkspace } from './dom';

/**
 * SVG source of the active document. The text follows the drawing while the
 * dialog is open; Apply rebuilds the drawing from the text. Documents with
 * images are read-only here, because images do not round-trip through SVG text.
 */
export class CodePanel {
  private dlg = $<HTMLDialogElement>('code-dialog');
  private text = $<HTMLTextAreaElement>('code-text');
  private note = $('code-note');
  private apply = $<HTMLButtonElement>('code-apply');
  private ws: Workspace | null = null;
  private unsub: (() => void) | null = null;

  constructor(private active: ActiveWorkspace) {
    $('menu-code').onclick = () => this.open();
    $('code-close').onclick = () => this.close();
    this.dlg.addEventListener('close', () => this.close());
    this.apply.onclick = () => this.applyText();
    this.text.oninput = () => (this.note.textContent = '');
  }

  private open(): void {
    this.ws = this.active();
    this.refresh();
    this.unsub = this.ws.subscribe(() => this.refresh());
    this.dlg.showModal();
  }

  private close(): void {
    this.unsub?.();
    this.unsub = null;
    this.ws = null;
    if (this.dlg.open) this.dlg.close();
  }

  /** Show the current drawing as SVG, unless the user is typing in the box. */
  private refresh(): void {
    if (!this.ws) return;
    const hasImages = this.ws.state.layers.some((l) => l.items.some((it) => it.kind === 'image'));
    this.apply.disabled = hasImages;
    this.note.textContent = hasImages ? 'This document has images, which do not round-trip through SVG text, so it is read-only here.' : '';
    if (document.activeElement !== this.text) this.text.value = toSvg(resolveDefs(this.ws.state));
  }

  private applyText(): void {
    const ws = this.ws;
    if (!ws) return;
    try {
      const r = importSvg(this.text.value);
      const first = ws.state.layers[0];
      ws.edit('Edit SVG code', (s) => ({ ...s, width: r.width, height: r.height, layers: [{ ...first, items: r.items }] }));
      ws.view = { ...ws.view, fitted: false };
      this.note.textContent = r.warnings.length ? `Applied. Not imported: ${r.warnings.join('; ')}` : 'Applied.';
    } catch (e) {
      this.note.textContent = `Not applied: ${(e as Error).message}`;
    }
  }
}
