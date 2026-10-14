import {
  KEY_ACTIONS,
  bindableEvent,
  defaultControls,
  describeBinding,
  eventToBinding,
  saveControls,
  setBinding,
  type ControlSettings,
  type KeyAction,
  type WheelMode,
  type WheelSpeed,
} from '../controls';
import { $ } from './dom';

/**
 * Settings > Controls: a dialog with a Keyboard tab (rebind keys) and a Mouse tab (canvas drag and wheel).
 * Each change applies at once; `apply` stores it on the editor and saves it.
 */
export class ControlsPanel {
  /** The action waiting for a new key, or null. */
  private capturing: KeyAction | null = null;

  constructor(
    private current: () => ControlSettings,
    private apply: (next: ControlSettings) => void,
  ) {
    const menu = document.querySelector<HTMLElement>('#menubar .menu[data-menu="settings"]')!;
    const items = menu.querySelector<HTMLElement>('.menu-items')!;
    const dlg = $<HTMLDialogElement>('controls-dialog');
    menu.querySelector<HTMLElement>('.menu-title')!.onclick = () => (items.hidden = !items.hidden);
    document.addEventListener('pointerdown', (e) => {
      if (!menu.contains(e.target as Node)) items.hidden = true;
    });
    $('menu-controls').onclick = () => {
      items.hidden = true;
      this.render();
      dlg.showModal();
    };

    $('tab-keys').onclick = () => this.showTab('keys');
    $('tab-mouse').onclick = () => this.showTab('mouse');
    $('controls-reset').onclick = () => this.commit(defaultControls());
    $('controls-close').onclick = () => dlg.close();
    dlg.addEventListener('close', () => this.stopCapture());

    $<HTMLInputElement>('mouse-middle-pan').onchange = (e) =>
      this.setMouse({ middlePan: (e.target as HTMLInputElement).checked });
    $<HTMLSelectElement>('mouse-wheel').onchange = (e) =>
      this.setMouse({ wheel: (e.target as HTMLSelectElement).value as WheelMode });
    $<HTMLSelectElement>('mouse-speed').onchange = (e) =>
      this.setMouse({ wheelSpeed: Number((e.target as HTMLSelectElement).value) as WheelSpeed });

    // Captures in the capture phase so the editor's shortcuts never see the key being bound.
    window.addEventListener('keydown', (e) => this.onCapture(e), true);
    this.render();
  }

  private showTab(tab: 'keys' | 'mouse'): void {
    $('tab-keys').setAttribute('aria-selected', String(tab === 'keys'));
    $('tab-mouse').setAttribute('aria-selected', String(tab === 'mouse'));
    $('panel-keys').hidden = tab !== 'keys';
    $('panel-mouse').hidden = tab !== 'mouse';
    this.stopCapture();
  }

  private commit(next: ControlSettings): void {
    this.apply(next);
    saveControls(next);
    this.render();
  }

  private setMouse(patch: Partial<ControlSettings['mouse']>): void {
    const c = this.current();
    this.commit({ ...c, mouse: { ...c.mouse, ...patch } });
  }

  private startCapture(action: KeyAction): void {
    this.capturing = action;
    this.render();
  }

  private stopCapture(): void {
    if (!this.capturing) return;
    this.capturing = null;
    this.render();
  }

  private onCapture(e: KeyboardEvent): void {
    if (!this.capturing || !$<HTMLDialogElement>('controls-dialog').open) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') return this.stopCapture();
    if (!bindableEvent(e)) return;
    const action = this.capturing;
    this.capturing = null;
    // Backspace clears the binding; any other key is bound, taking it from the action that had it.
    const binding = e.key === 'Backspace' ? '' : eventToBinding(e);
    const c = this.current();
    this.commit({ ...c, keys: setBinding(c.keys, action, binding) });
  }

  render(): void {
    const c = this.current();
    this.renderKeys(c);
    $<HTMLInputElement>('mouse-middle-pan').checked = c.mouse.middlePan;
    $<HTMLSelectElement>('mouse-wheel').value = c.mouse.wheel;
    $<HTMLSelectElement>('mouse-speed').value = String(c.mouse.wheelSpeed);
  }

  private renderKeys(c: ControlSettings): void {
    const table = $('key-table');
    table.replaceChildren();
    let group = '';
    for (const a of KEY_ACTIONS) {
      if (a.group !== group) {
        group = a.group;
        const h = document.createElement('tr');
        h.className = 'key-group';
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = group;
        h.append(th);
        table.append(h);
      }
      const row = document.createElement('tr');
      const label = document.createElement('td');
      label.textContent = a.label;
      const cell = document.createElement('td');
      const btn = document.createElement('button');
      btn.className = 'key-btn';
      const waiting = this.capturing === a.id;
      btn.textContent = waiting ? 'Press a key…' : describeBinding(c.keys[a.id]);
      btn.title = waiting ? 'Press the new key. Esc cancels, Backspace clears.' : 'Click to change';
      btn.classList.toggle('waiting', waiting);
      btn.onclick = () => this.startCapture(a.id);
      cell.append(btn);
      row.append(label, cell);
      table.append(row);
    }
  }
}
