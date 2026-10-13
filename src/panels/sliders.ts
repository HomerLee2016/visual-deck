import type { ActiveWorkspace } from './dom';

/** Geometry fields have no fixed limits, so their sliders span the document: [lo, hi] as multiples of its size. */
const GEO_RANGE: Record<string, { size: 'w' | 'h'; lo: number; hi: number }> = {
  'geo-x': { size: 'w', lo: -1, hi: 2 },
  'geo-y': { size: 'h', lo: -1, hi: 2 },
  'geo-w': { size: 'w', lo: 0, hi: 2 },
  'geo-h': { size: 'h', lo: 0, hi: 2 },
};

/**
 * Puts a slider beside every number input in the sidebar and Options pop-out, so values can be dragged
 * instead of typed. The number stays as the readout and the way to type an exact value; all existing
 * handlers keep listening to it. While the slider is dragged only the number changes; the `change`
 * event fires on release, so each drag is one history step.
 */
export class NumberSliders {
  private pairs: { num: HTMLInputElement; range: HTMLInputElement }[] = [];

  constructor(private active: ActiveWorkspace) {
    document.querySelectorAll<HTMLInputElement>('aside input[type="number"], #options input[type="number"]').forEach((num) => {
      // The shared Size control already has its own slider.
      if (num.id === 'opt-size') return;
      this.add(num);
    });
    this.sync();
  }

  private add(num: HTMLInputElement): void {
    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'num-slider';
    range.setAttribute('aria-label', `${num.getAttribute('aria-label') ?? num.closest('label')?.textContent?.trim() ?? num.id} slider`);
    const wrap = document.createElement('span');
    wrap.className = 'width-controls';
    num.replaceWith(wrap);
    wrap.append(range, num);
    range.oninput = () => (num.value = range.value);
    range.onchange = () => {
      num.value = range.value;
      num.dispatchEvent(new Event('change', { bubbles: true }));
    };
    // Typing a value moves the slider; handlers may also clamp it, so look again afterwards.
    num.addEventListener('change', () => this.syncOne(num, range));
    this.pairs.push({ num, range });
  }

  /** Match each slider to its number: limits, step, value and disabled state. Call after anything sets a number. */
  sync(): void {
    for (const { num, range } of this.pairs) this.syncOne(num, range);
  }

  private syncOne(num: HTMLInputElement, range: HTMLInputElement): void {
    const geo = GEO_RANGE[num.id];
    if (geo) {
      const size = this.active?.()?.state[geo.size === 'w' ? 'width' : 'height'] ?? 512;
      range.min = String(Math.round(size * geo.lo));
      range.max = String(Math.round(size * geo.hi));
      range.step = '0.1';
    } else if (num.id === 'geo-rot') {
      range.min = '-360';
      range.max = '360';
      range.step = '0.1';
    } else {
      range.min = num.min || '0';
      range.max = num.max || '100';
      range.step = num.step && num.step !== 'any' ? num.step : '1';
    }
    range.value = num.value;
    range.disabled = num.disabled;
  }
}

