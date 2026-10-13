import { loadPrefs, savePrefs } from '../prefs';

/**
 * Makes each sidebar section collapsible by clicking its heading. Sections marked
 * `data-fixed` (Tools, Scripts) always stay expanded. Every other section starts
 * collapsed until the user changes it; after that the choice is remembered.
 */
export function initCollapsible(): void {
  const saved = loadPrefs().collapsed;
  const collapsed = new Set(saved);
  document.querySelectorAll<HTMLElement>('aside section[data-id]').forEach((sec) => {
    if (sec.dataset.fixed !== undefined) return;
    const id = sec.dataset.id!;
    if (!saved) collapsed.add(id);
    const head = sec.querySelector('h2')!;
    head.setAttribute('role', 'button');
    head.tabIndex = 0;
    const apply = (c: boolean) => {
      sec.classList.toggle('collapsed', c);
      head.setAttribute('aria-expanded', String(!c));
    };
    const toggle = () => {
      // Clicks on buttons inside the heading (such as "+") do their own job.
      const c = !sec.classList.contains('collapsed');
      apply(c);
      const ids = new Set(loadPrefs().collapsed ?? []);
      if (c) ids.add(id);
      else ids.delete(id);
      savePrefs({ collapsed: [...ids] });
    };
    apply(collapsed.has(id));
    head.onclick = (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      toggle();
    };
    head.onkeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggle();
    };
  });
}
