import { loadPrefs, savePrefs } from '../prefs';

/** Sections that start expanded when the user has not changed the layout yet. */
const OPEN_BY_DEFAULT = new Set(['history', 'layers']);

/**
 * Makes each sidebar section collapsible by clicking its heading. Sections marked
 * `data-fixed` (Tools, Scripts) always stay expanded. Every other section starts
 * collapsed (except OPEN_BY_DEFAULT) until the user changes it; after that the choice is remembered.
 */
export class CollapsibleSections {
  private collapsed: Set<string>;

  constructor() {
    const saved = loadPrefs().collapsed;
    this.collapsed = new Set(saved ?? []);
    document.querySelectorAll<HTMLElement>('aside section[data-id]:not([data-fixed])').forEach((sec) => {
      if (saved === undefined && !OPEN_BY_DEFAULT.has(sec.dataset.id!)) this.collapsed.add(sec.dataset.id!);
      this.bind(sec);
    });
    this.render();
  }

  render(): void {
    document.querySelectorAll<HTMLElement>('aside section[data-id]:not([data-fixed])').forEach((sec) => {
      const c = this.collapsed.has(sec.dataset.id!);
      sec.classList.toggle('collapsed', c);
      sec.querySelector('h2')!.setAttribute('aria-expanded', String(!c));
    });
  }

  private bind(sec: HTMLElement): void {
    const id = sec.dataset.id!;
    const head = sec.querySelector('h2')!;
    head.setAttribute('role', 'button');
    head.tabIndex = 0;
    const toggle = () => {
      if (this.collapsed.has(id)) this.collapsed.delete(id);
      else this.collapsed.add(id);
      savePrefs({ collapsed: [...this.collapsed] });
      this.render();
    };
    head.onclick = (e) => {
      // Clicks on buttons inside the heading (such as "+") do their own job.
      if ((e.target as HTMLElement).closest('button')) return;
      toggle();
    };
    head.onkeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggle();
    };
  }
}
