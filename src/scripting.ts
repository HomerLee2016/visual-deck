import { buildShape, POINTS_NEEDED, type ClickShapeKind } from './geometry';
import type { Workspace } from './model';
import { DEFAULT_STYLE, imageItem, uid } from './model';
import { renderToCanvas } from './render';
import type { Item, Style } from './types';
import traceToSvgCode from './builtin/trace-to-svg.js?raw';

export interface ScriptDef {
  id: string;
  name: string;
  code: string;
}

const STORAGE_KEY = 'visual-deck.scripts.v1';

export const DEFAULT_SCRIPTS: ScriptDef[] = [
  {
    id: 'builtin-invert',
    name: 'Invert',
    code: `// Invert the colours of the active layer (rasterizes it).
const img = deck.getImageData();
const d = img.data;
for (let i = 0; i < d.length; i += 4) {
  d[i] = 255 - d[i];
  d[i + 1] = 255 - d[i + 1];
  d[i + 2] = 255 - d[i + 2];
}
deck.setImageData(deck.activeLayerId, img);
`,
  },
  {
    id: 'builtin-gray',
    name: 'Grayscale',
    code: `// Convert the active layer to grayscale (rasterizes it).
const img = deck.getImageData();
const d = img.data;
for (let i = 0; i < d.length; i += 4) {
  const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  d[i] = d[i + 1] = d[i + 2] = g;
}
deck.setImageData(deck.activeLayerId, img);
`,
  },
  {
    id: 'builtin-grid',
    name: '32px Grid',
    code: `// Draw a 32px guide grid on a new layer.
const size = 32;
const style = { color: '#00e5ff', width: 1 };
const layer = deck.addLayer('Grid');
for (let x = 0; x <= deck.width; x += size) deck.addLine(x, 0, x, deck.height, style, layer);
for (let y = 0; y <= deck.height; y += size) deck.addLine(0, y, deck.width, y, style, layer);
deck.log('Grid drawn');
`,
  },
  {
    id: 'builtin-trace',
    name: 'Trace to SVG',
    code: traceToSvgCode,
  },
];

export function loadScripts(): ScriptDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw) as ScriptDef[];
      if (Array.isArray(list)) return list;
    }
  } catch {
    /* storage unavailable or corrupt: fall back to defaults */
  }
  return DEFAULT_SCRIPTS.map((s) => ({ ...s }));
}

export function saveScripts(list: ScriptDef[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export const API_HELP = `deck.width, deck.height            document size
deck.layers                        [{ id, name, visible, itemCount }]
deck.activeLayerId                 id of the active layer
deck.addLayer(name)                -> layer id (becomes active)
deck.getImageData(layerId?)        ImageData of a layer (default: active layer, even if hidden)
deck.getComposite()                ImageData of all visible layers
deck.setImageData(layerId, img)    replace a layer's content with a bitmap
deck.addLine(x1,y1,x2,y2, style?, layerId?)
deck.addArc(x1,y1,x2,y2, mx,my, style?, layerId?)        arc through (mx,my)
deck.addCurve(x1,y1,x2,y2, c1x,c1y,c2x,c2y, style?, layerId?)
deck.selection                     [{ id, kind }] of the current selection
deck.clearLayer(layerId?)          remove everything on a layer
deck.log(...args)                  show a message in the status bar
style = { color: '#rrggbb', width: 2, fill?: '#rrggbb', opacity?: 0..1 }

Scripts are plain JavaScript (async/await works). One history step is
recorded per run, named after the button.`;

export interface Deck {
  readonly width: number;
  readonly height: number;
  readonly layers: { id: string; name: string; visible: boolean; itemCount: number }[];
  readonly activeLayerId: string;
  readonly selection: { id: string; kind: Item['kind'] }[];
  addLayer(name?: string): string;
  getImageData(layerId?: string): ImageData;
  getComposite(): ImageData;
  setImageData(layerId: string, img: ImageData): void;
  addLine(x1: number, y1: number, x2: number, y2: number, style?: Partial<Style>, layerId?: string): void;
  addArc(x1: number, y1: number, x2: number, y2: number, mx: number, my: number, style?: Partial<Style>, layerId?: string): void;
  addCurve(
    x1: number, y1: number, x2: number, y2: number,
    c1x: number, c1y: number, c2x: number, c2y: number,
    style?: Partial<Style>, layerId?: string,
  ): void;
  clearLayer(layerId?: string): void;
  log(...args: unknown[]): void;
}

export function createDeck(ws: Workspace, log: (msg: string) => void): Deck {
  const style = (s?: Partial<Style>): Style => ({ ...DEFAULT_STYLE, ...s });
  const shape = (kind: ClickShapeKind, pts: { x: number; y: number }[], s: Partial<Style> | undefined, layerId?: string) => {
    if (pts.length !== POINTS_NEEDED[kind]) throw new Error(`${kind} needs ${POINTS_NEEDED[kind]} points`);
    const item = buildShape(kind, pts, style(s), uid('item'));
    if (item) ws.addItem(null, item, layerId ?? ws.activeLayerId);
  };
  const imageData = (c: HTMLCanvasElement) => c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);

  return {
    get width() { return ws.state.width; },
    get height() { return ws.state.height; },
    get layers() {
      return ws.state.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, itemCount: l.items.length }));
    },
    get activeLayerId() { return ws.activeLayerId; },
    get selection() { return ws.selectedItems().map((it) => ({ id: it.id, kind: it.kind })); },
    addLayer: (name) => ws.addLayer(null, name),
    getImageData: (layerId = ws.activeLayerId) => imageData(renderToCanvas(ws.state, layerId)),
    getComposite: () => imageData(renderToCanvas(ws.state)),
    setImageData(layerId, img) {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.putImageData(img, 0, 0);
      ws.replaceLayerItems(null, layerId, [imageItem(c)]);
    },
    addLine: (x1, y1, x2, y2, s, layerId) => shape('line', [{ x: x1, y: y1 }, { x: x2, y: y2 }], s, layerId),
    addArc: (x1, y1, x2, y2, mx, my, s, layerId) =>
      shape('arc', [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: mx, y: my }], s, layerId),
    addCurve: (x1, y1, x2, y2, c1x, c1y, c2x, c2y, s, layerId) =>
      shape('curve', [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: c1x, y: c1y }, { x: c2x, y: c2y }], s, layerId),
    clearLayer: (layerId = ws.activeLayerId) => ws.replaceLayerItems(null, layerId, []),
    log: (...args) => log(args.map(String).join(' ')),
  };
}

type AsyncFn = new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as AsyncFn;

/** Run a user script against the workspace. Records one history step named after the script. */
export async function runScript(def: ScriptDef, ws: Workspace, log: (msg: string) => void): Promise<void> {
  const before = ws.state;
  const deck = createDeck(ws, log);
  try {
    await new AsyncFunction('deck', def.code)(deck);
    ws.selection.clear();
    if (!ws.commit(def.name)) log(`${def.name}: done (no changes)`);
    else log(`${def.name}: done`);
  } catch (err) {
    // Roll back partial edits from a failed run.
    ws.state = before;
    ws.changed();
    console.error(err);
    log(`${def.name} failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
