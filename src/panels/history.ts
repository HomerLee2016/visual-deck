import { $, type ActiveWorkspace } from './dom';

export class HistoryPanel {
  constructor(private active: ActiveWorkspace) {}

  render(): void {
    const ws = this.active();
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
}
