import type { TextRequest } from '../editor';
import { fontOf, type TextStyle } from '../items/text';

/**
 * Inline text entry laid over the canvas. Ctrl+Enter or clicking away
 * commits; Escape cancels. Only one entry is open at a time.
 */
export class TextInput {
  private el: HTMLTextAreaElement | null = null;
  private req: TextRequest | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private commit: (req: TextRequest, text: string) => void,
  ) {}

  open(req: TextRequest, style: TextStyle, color: string): void {
    this.finish(true);
    const box = this.canvas.getBoundingClientRect();
    const el = document.createElement('textarea');
    el.className = 'text-input';
    el.value = req.item?.text ?? '';
    const s = req.item ?? { ...style, style: { color } };
    el.style.left = `${box.left + req.screen.x}px`;
    el.style.top = `${box.top + req.screen.y}px`;
    el.style.font = fontOf({ weight: s.weight, size: s.size * req.zoom, font: s.font });
    el.style.lineHeight = '1.2';
    el.style.color = req.item ? req.item.style.color : color;
    el.style.textAlign = s.align;
    el.rows = Math.max(1, el.value.split('\n').length);
    el.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.finish(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.finish(true);
      }
    };
    el.onblur = () => this.finish(true);
    document.body.append(el);
    this.el = el;
    this.req = req;
    // Focus after the mousedown that opened us: its default action would otherwise move focus away and commit at once.
    requestAnimationFrame(() => el.focus());
  }

  /** Close the entry, committing its text when `keep` is true. */
  private finish(keep: boolean): void {
    const el = this.el;
    const req = this.req;
    if (!el || !req) return;
    this.el = null;
    this.req = null;
    const text = el.value;
    el.remove();
    if (keep) this.commit(req, text);
  }
}
