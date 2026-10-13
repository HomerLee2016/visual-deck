import { reserveUid } from './model';
import type { Matrix } from './matrix';
import type { DocState, Item, Layer } from './types';
import { INITIAL_VIEW, type View } from './view';

/** Turns bitmaps into strings and back; injected so this file stays free of the DOM. */
export interface ImageCodec {
  encode(canvas: HTMLCanvasElement): string;
  decode(data: string): Promise<HTMLCanvasElement>;
}

export const PROJECT_FORMAT = 'visual-deck';
export const PROJECT_VERSION = 1;
export const PROJECT_EXT = '.vdeck';

type StoredItem = Exclude<Item, { kind: 'image' }> | { kind: 'image'; id: string; x: number; y: number; img: number; transform?: Matrix };
interface StoredLayer extends Omit<Layer, 'items'> {
  items: StoredItem[];
}
interface StoredState {
  width: number;
  height: number;
  layers: StoredLayer[];
}

/** What a project file holds; also what `Workspace.restore` needs. */
export interface Project {
  name: string;
  history: { label: string; state: DocState }[];
  index: number;
  activeLayerId: string;
  view: View;
}

interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  name: string;
  index: number;
  activeLayerId: string;
  view: View;
  /** Distinct bitmaps as data URLs; items refer to them by position so history does not repeat them. */
  images: string[];
  history: { label: string; state: StoredState }[];
}

/** The slice of a workspace that is saved. */
export interface Saveable {
  name: string;
  history: readonly { label: string; state: DocState }[];
  index: number;
  activeLayerId: string;
  view: View;
}

export function serializeProject(ws: Saveable, codec: ImageCodec): string {
  const images: string[] = [];
  const ids = new Map<HTMLCanvasElement, number>();
  const imageId = (c: HTMLCanvasElement) => {
    let i = ids.get(c);
    if (i === undefined) {
      i = images.push(codec.encode(c)) - 1;
      ids.set(c, i);
    }
    return i;
  };
  const item = (it: Item): StoredItem =>
    it.kind === 'image' ? { kind: 'image', id: it.id, x: it.x, y: it.y, img: imageId(it.canvas), transform: it.transform } : it;
  const file: ProjectFile = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: ws.name,
    index: ws.index,
    activeLayerId: ws.activeLayerId,
    view: ws.view,
    images,
    history: ws.history.map((h) => ({
      label: h.label,
      state: { width: h.state.width, height: h.state.height, layers: h.state.layers.map((l) => ({ ...l, items: l.items.map(item) })) },
    })),
  };
  return JSON.stringify(file);
}

export async function parseProject(text: string, codec: ImageCodec): Promise<Project> {
  let file: Partial<ProjectFile>;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('Not a Visual Deck project file');
  }
  if (file.format !== PROJECT_FORMAT || !Array.isArray(file.history) || !Array.isArray(file.images) || file.history.length === 0) {
    throw new Error('Not a Visual Deck project file');
  }
  if ((file.version ?? 0) > PROJECT_VERSION) throw new Error('This project was saved by a newer version');

  const canvases = await Promise.all(file.images.map((d) => codec.decode(d)));
  const item = (it: StoredItem): Item => {
    reserveUid(it.id);
    if (it.kind !== 'image') return it;
    const canvas = canvases[it.img];
    if (!canvas) throw new Error('Project file is missing an image');
    return { kind: 'image', id: it.id, x: it.x, y: it.y, canvas, transform: it.transform };
  };
  const history = file.history.map((h) => ({
    label: h.label,
    state: {
      width: h.state.width,
      height: h.state.height,
      layers: h.state.layers.map((l) => {
        reserveUid(l.id);
        return { ...l, items: l.items.map(item) };
      }),
    } satisfies DocState,
  }));
  const index = Math.min(Math.max(file.index ?? 0, 0), history.length - 1);
  const layers = history[index].state.layers;
  return {
    name: file.name || 'Untitled',
    history,
    index,
    activeLayerId: file.activeLayerId ?? layers[layers.length - 1].id,
    view: file.view ?? INITIAL_VIEW,
  };
}
