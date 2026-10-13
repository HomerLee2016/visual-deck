import { cropToItems } from '../arrange';
import { download, exportDocument, isImageFile, isProjectFile, type ExportFormat } from '../io';
import { $, type ActiveWorkspace } from './dom';

/** File menu: Open/Save project, Import (each image becomes a workspace) and the Export dialog. */
export class MenuBar {
  constructor(
    private active: ActiveWorkspace,
    private importFile: (file: File) => void,
    private openProject: (file: File) => void,
    private saveProject: () => void,
    private status: (msg: string) => void,
  ) {
    const menu = document.querySelector<HTMLElement>('#menubar .menu')!;
    const items = menu.querySelector<HTMLElement>('.menu-items')!;
    const title = menu.querySelector<HTMLElement>('.menu-title')!;
    const closeMenu = () => (items.hidden = true);
    title.onclick = () => (items.hidden = !items.hidden);
    document.addEventListener('pointerdown', (e) => {
      if (!menu.contains(e.target as Node)) closeMenu();
    });

    const input = $<HTMLInputElement>('file-input');
    $('menu-import').onclick = () => {
      closeMenu();
      input.click();
    };
    input.onchange = () => {
      for (const f of Array.from(input.files ?? [])) this.import(f);
      input.value = '';
    };

    const projectInput = $<HTMLInputElement>('project-input');
    $('menu-open').onclick = () => {
      closeMenu();
      projectInput.click();
    };
    projectInput.onchange = () => {
      for (const f of Array.from(projectInput.files ?? [])) this.openProject(f);
      projectInput.value = '';
    };
    $('menu-save').onclick = () => {
      closeMenu();
      this.saveProject();
    };

    const dlg = $<HTMLDialogElement>('export-dialog');
    $('menu-export').onclick = () => {
      closeMenu();
      $<HTMLInputElement>('export-selection').disabled = this.active().selectedItems(true).length === 0;
      dlg.showModal();
    };
    $('export-cancel').onclick = () => dlg.close();
    $<HTMLFormElement>('export-form').onsubmit = () => {
      const data = new FormData($<HTMLFormElement>('export-form'));
      const scale = Number(data.get('scale') ?? 1) || 1;
      this.export((data.get('format') as ExportFormat | null) ?? 'png', scale, data.get('selection') === 'on');
    };
  }

  /** Also used for dropped files (images and projects). */
  import(file: File): void {
    if (isProjectFile(file)) this.openProject(file);
    else if (isImageFile(file)) this.importFile(file);
    else this.status(`${file.name} is not an image or project`);
  }

  private export(format: ExportFormat, scale = 1, selectionOnly = false): void {
    const ws = this.active();
    const ids = new Set(ws.selectedItems(true).map((it) => it.id));
    const state = selectionOnly && ids.size > 0 ? cropToItems(ws.state, ids) : ws.state;
    const name = selectionOnly && ids.size > 0 ? `${ws.name} selection` : ws.name;
    exportDocument(state, format, scale)
      .then((blob) => download(blob, `${name}.${format}`))
      .catch(() => this.status(`Could not export ${name}`));
  }
}
