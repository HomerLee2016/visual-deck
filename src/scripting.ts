import { buildShape, clickSpec, type ClickShapeKind } from './geometry';
import { DEFAULT_STYLE, imageItem, uid, type Workspace } from './model';
import { renderToCanvas } from './render';
import { fileToCanvas, pickImageFile } from './io';
import { compositeMasked } from './mask';
import type { Item, PathItem, Style } from './types';
import traceToSvgCode from './builtin/trace-to-svg.js?raw';
import splitByColourCode from './builtin/split-by-colour.js?raw';

export interface ScriptDef {
  id: string;
  name: string;
  code: string;
}

/** A path node for `deck.addPath`: a point, with optional incoming and outgoing handles. */
export interface PathPoint {
  x: number;
  y: number;
  in?: { x: number; y: number };
  out?: { x: number; y: number };
}

/** One subpath for `deck.addPath`. A closed subpath also joins its last node back to its first. */
export interface PathSub {
  nodes: PathPoint[];
  closed: boolean;
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
  {
    id: 'builtin-split-colour',
    name: 'Split by colour',
    code: splitByColourCode,
  },
];

/** Built-in ids the user has been offered. A built-in missing from the saved list is added only if it is not in here. */
const SEEN_KEY = 'visual-deck.scripts.builtinsSeen.v1';

function readSeen(): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null');
    if (Array.isArray(list)) return new Set(list);
  } catch {
    /* storage unavailable or corrupt: nothing seen */
  }
  return new Set();
}

function writeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(DEFAULT_SCRIPTS.map((s) => s.id)));
  } catch {
    /* ignore */
  }
}

/**
 * The saved script list, with built-ins added in later versions appended.
 * A built-in the user deleted is not brought back, because its id was seen before.
 */
export function loadScripts(): ScriptDef[] {
  let saved: ScriptDef[] | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list = JSON.parse(raw) as ScriptDef[];
      if (Array.isArray(list)) saved = list;
    }
  } catch {
    /* storage unavailable or corrupt: fall back to defaults */
  }
  if (!saved) {
    writeSeen();
    return DEFAULT_SCRIPTS.map((s) => ({ ...s }));
  }
  const seen = readSeen();
  const present = new Set(saved.map((s) => s.id));
  const added = DEFAULT_SCRIPTS.filter((s) => !present.has(s.id) && !seen.has(s.id)).map((s) => ({ ...s }));
  writeSeen();
  return [...saved, ...added];
}

export function saveScripts(list: ScriptDef[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  writeSeen();
}

export const API_HELP = `deck.width, deck.height            document size
deck.layers                        [{ id, name, visible, itemCount }]
deck.activeLayerId                 id of the active layer
deck.addLayer(name)                -> layer id (becomes active)
deck.getImageData(layerId?)        ImageData of a layer (default: active layer, even if hidden)
deck.getComposite()                ImageData of all visible layers
deck.setImageData(layerId, img)    replace a layer's content with a bitmap
deck.addLine(x1,y1,x2,y2, style?, layerId?)
deck.addRect(x1,y1,x2,y2, style?, layerId?)           opposite corners
deck.addEllipse(x1,y1,x2,y2, style?, layerId?)        ellipse inside the box
deck.addArc(x1,y1,x2,y2, mx,my, style?, layerId?)        arc through (mx,my)
deck.addCurve(x1,y1,x2,y2, c1x,c1y,c2x,c2y, style?, layerId?)
deck.addPath(subs, style?, layerId?)   one editable path; subs = [{ nodes: [{ x, y, in?, out? }], closed }]
deck.selection                    [{ id, kind }] of the current selection
deck.pickImage()                   -> ImageData of a picked image file, or null if cancelled
                                      (call it first in the script: needs the click)
deck.clearLayer(layerId?)          remove everything on a layer
deck.log(...args)                  show a message in the status bar
style = { color: '#rrggbb' or 'rgba(r, g, b, a)', width: 2, fill?: '#rrggbb', opacity?: 0..1,
        cap?: 'butt'|'round'|'square', join?: 'miter'|'round'|'bevel', miterLimit?: n, dash?: [on, off, ...] }

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
  addRect(x1: number, y1: number, x2: number, y2: number, style?: Partial<Style>, layerId?: string): void;
  addEllipse(x1: number, y1: number, x2: number, y2: number, style?: Partial<Style>, layerId?: string): void;
  addArc(x1: number, y1: number, x2: number, y2: number, mx: number, my: number, style?: Partial<Style>, layerId?: string): void;
  addCurve(
    x1: number, y1: number, x2: number, y2: number,
    c1x: number, c1y: number, c2x: number, c2y: number,
    style?: Partial<Style>, layerId?: string,
  ): void;
  addPath(subs: PathSub[], style?: Partial<Style>, layerId?: string): void;
  pickImage(): Promise<ImageData | null>;
  clearLayer(layerId?: string): void;
  log(...args: unknown[]): void;
}

/** Open a file picker and decode the chosen image. */
async function pickImageData(): Promise<ImageData | null> {
  const file = await pickImageFile();
  if (!file) return null;
  const c = await fileToCanvas(file);
  return c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
}

export function createDeck(
  ws: Workspace,
  log: (msg: string) => void,
  pick: () => Promise<ImageData | null> = pickImageData,
): Deck {
  const style = (s?: Partial<Style>): Style => ({ ...DEFAULT_STYLE, ...s });
  const shape = (kind: ClickShapeKind, pts: { x: number; y: number }[], s: Partial<Style> | undefined, layerId?: string) => {
    const needed = clickSpec(kind).needed;
    if (pts.length !== needed) throw new Error(`${kind} needs ${needed} points`);
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
      // With a mask, only the masked pixels take the script's result; the rest keep the layer's pixels.
      const mask = ws.activeMask();
      let pixels = img;
      if (mask) {
        if (img.width !== mask.width || img.height !== mask.height) {
          throw new Error(`the mask is ${mask.width}×${mask.height}, but the script produced ${img.width}×${img.height}`);
        }
        pixels = new ImageData(compositeMasked(imageData(renderToCanvas(ws.state, layerId)), img, mask.data).data, img.width, img.height);
      }
      const c = document.createElement('canvas');
      c.width = pixels.width;
      c.height = pixels.height;
      c.getContext('2d')!.putImageData(pixels, 0, 0);
      ws.replaceLayerItems(null, layerId, [imageItem(c)]);
    },
    addRect: (x1, y1, x2, y2, s, layerId) => shape('rect', [{ x: x1, y: y1 }, { x: x2, y: y2 }], s, layerId),
    addEllipse: (x1, y1, x2, y2, s, layerId) => shape('ellipse', [{ x: x1, y: y1 }, { x: x2, y: y2 }], s, layerId),
    addLine: (x1, y1, x2, y2, s, layerId) => shape('line', [{ x: x1, y: y1 }, { x: x2, y: y2 }], s, layerId),
    addArc: (x1, y1, x2, y2, mx, my, s, layerId) =>
      shape('arc', [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: mx, y: my }], s, layerId),
    addCurve: (x1, y1, x2, y2, c1x, c1y, c2x, c2y, s, layerId) =>
      shape('curve', [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: c1x, y: c1y }, { x: c2x, y: c2y }], s, layerId),
    addPath(subs, s, layerId) {
      const item: PathItem = {
        kind: 'path',
        id: uid('item'),
        style: style(s),
        subs: subs.map((sub) => ({
          closed: sub.closed,
          nodes: sub.nodes.map((n) => ({
            p: { x: n.x, y: n.y },
            ...(n.in ? { in: { ...n.in } } : {}),
            ...(n.out ? { out: { ...n.out } } : {}),
          })),
        })),
      };
      ws.addItem(null, item, layerId ?? ws.activeLayerId);
    },
    pickImage: pick,
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
