import { $, type ActiveWorkspace } from './dom';

export class LayersPanel {
  constructor(private active: ActiveWorkspace) {
    $('layer-add').onclick = () => this.active().addLayer('Add layer');
    $('layer-up').onclick = () => this.active().moveLayer(this.active().activeLayer.id, 1);
    $('layer-down').onclick = () => this.active().moveLayer(this.active().activeLayer.id, -1);
    $('layer-merge').onclick = () => this.active().mergeLayerDown(this.active().activeLayer.id);
    $('layer-del').onclick = () => this.active().removeLayer(this.active().activeLayer.id);
    $('layer-toggle-all').onclick = () => {
      const ws = this.active();
      // Any visible layer means "all shown" (eye), so the click hides everything. Only all-hidden shows them again.
      ws.setAllLayersVisible(!ws.state.layers.some((l) => l.visible));
    };
  }

  render(): void {
    const ws = this.active();
    const list = $('layers');
    // One switch for every layer: the open eye while any layer is shown (click hides all),
    // the ban icon only when every layer is hidden (click shows all).
    const anyVisible = ws.state.layers.some((l) => l.visible);
    const toggle = $('layer-toggle-all');
    toggle.textContent = anyVisible ? '👁' : '🚫';
    toggle.title = anyVisible ? 'Hide all layers' : 'Show all layers';
    toggle.setAttribute('aria-pressed', String(anyVisible));
    list.replaceChildren();
    // Top of the stack first.
    for (const layer of [...ws.state.layers].reverse()) {
      const li = document.createElement('li');
      li.className = layer.id === ws.activeLayer.id ? 'active' : '';
      const eye = document.createElement('button');
      eye.className = 'eye';
      eye.textContent = layer.visible ? '👁' : '🚫';
      eye.title = layer.visible ? 'Hide layer' : 'Show layer';
      eye.setAttribute('aria-pressed', String(layer.visible));
      eye.onclick = (e) => {
        e.stopPropagation();
        ws.setLayerVisible(layer.id, !layer.visible);
      };
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = layer.name;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = String(layer.items.length);
      li.append(eye, name, count);
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
