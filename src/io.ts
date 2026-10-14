import { PROJECT_EXT, parseProject, serializeProject, type ImageCodec, type Project, type Saveable } from './project';
import { renderToCanvas } from './render';
import { contentBounds } from './trim';
import { toSvg } from './svg';
import type { DocState } from './types';

export type ExportFormat = 'svg' | 'png';

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.svg$/i.test(file.name);
}

/** Decode an image file into a canvas. SVG goes through <img> since createImageBitmap rejects it. */
export async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('SVG has no intrinsic size');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    } finally {
      URL.revokeObjectURL(url);
    }
    return c;
  }
  const bmp = await createImageBitmap(file);
  c.width = bmp.width;
  c.height = bmp.height;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}

/**
 * Open the browser's file picker for one image. Resolves to the chosen file, or null if the picker is cancelled.
 * Must be called from a user gesture (a button click), before any `await`.
 */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.svg';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Crop a canvas to its coloured pixels; an empty canvas is returned unchanged. */
function trimCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const box = contentBounds(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  if (!box || (box.w === c.width && box.h === c.height)) return c;
  const out = document.createElement('canvas');
  out.width = box.w;
  out.height = box.h;
  out.getContext('2d')!.drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return out;
}

/**
 * Export as SVG (vector; `scale` and `trim` ignored) or PNG at `scale` times the document size.
 * With `trim`, the PNG is cropped to the smallest rectangle covering every coloured pixel.
 */
export function exportDocument(s: DocState, format: ExportFormat, scale = 1, trim = false): Promise<Blob> {
  if (format === 'svg') return Promise.resolve(new Blob([toSvg(s)], { type: 'image/svg+xml' }));
  let canvas = renderToCanvas(s, undefined, scale);
  if (trim) canvas = trimCanvas(canvas);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'),
  );
}

export function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const isProjectFile = (file: File) => file.name.toLowerCase().endsWith(PROJECT_EXT);

export const domCodec: ImageCodec = {
  encode: (c) => c.toDataURL('image/png'),
  decode: async (data) => {
    const img = new Image();
    img.src = data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c;
  },
};

export const projectToBlob = (ws: Saveable): Blob =>
  new Blob([serializeProject(ws, domCodec)], { type: 'application/json' });

export const fileToProject = async (file: File): Promise<Project> => parseProject(await file.text(), domCodec);
