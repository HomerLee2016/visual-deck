import { $, type ActiveWorkspace } from './dom';

export class LayersPanel {
  constructor(private active: ActiveWorkspace) {
    $('layer-add').onclick = () => this.active().addLayer('Add layer');
    $('layer-up').onclick = () => this.active().moveLayer(this.active().activeLayer.id, 1);
    $('layer-down').onclick = () => this.active().moveLayer(this.active().activeLayer.id, -1);
    $('layer-merge').onclick = () => this.active().mergeLayerDown(this.active().activeLayer.id);
    $('layer-del').onclick = () => this.active().removeLayer(this.active().activeLayer.id);
  }

  render(): void {
    const ws = this.active();
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
        this.render();
      };
      li.ondblclick = () => {
        const n = prompt('Rename layer', layer.name)?.trim();
        if (n) ws.renameLayer(layer.id, n);
      };
      list.append(li);
    }
  }
}
