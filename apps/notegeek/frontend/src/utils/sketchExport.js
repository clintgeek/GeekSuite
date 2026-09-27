/**
 * sketchExport.js — a sketch's page as an image a vision model can read
 * (DOCS/HANDWRITING.md §2, step 2).
 *
 * Two steps, both needed:
 *
 *   1. **tldraw's own export** (`exportToBlob`), not a screenshot: every shape
 *      on the current page, wherever the camera happens to be, at a scale
 *      chosen so the result stays under the size cap. It is asked for light
 *      mode (`darkMode: false`), so dark-theme ink comes out dark.
 *   2. **Flattened onto white.** tldraw's `background: true` paints its own
 *      light page colour (#f9fafb), and `false` leaves the PNG transparent —
 *      which a model reads as black, so dark ink vanished into it. The export
 *      is drawn onto an opaque #ffffff canvas instead, which also enforces
 *      the longest-edge cap exactly, whatever tldraw's own rendering did.
 *
 * `exportToBlob` is passed in rather than imported, so this module does not
 * pull tldraw into the editor page's chunk: HandwrittenEditor (lazy-loaded)
 * owns the tldraw import and hands its editor and export function here.
 */

/** The longest edge of the exported image, in pixels. */
export const EXPORT_MAX_EDGE = 2000;

/** Refused past this many encoded bytes: about 8 MB once base64'd. */
export const EXPORT_MAX_BYTES = 6 * 1024 * 1024;

/** Page-unit margin around the ink, so strokes at the edge are not clipped. */
export const EXPORT_PADDING = 32;

/**
 * tldraw 2.4's `exportToBlob` renders its SVG at twice the requested scale
 * (`getSvgAsImage(..., { scale: 2 })` in tldraw/src/lib/utils/export/export.ts).
 */
export const TLDRAW_PIXEL_RATIO = 2;

export const EXPORT_BACKGROUND = '#ffffff';

export class SketchExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SketchExportError';
    this.code = code;
  }
}

/**
 * Does a saved sketch snapshot contain any shape at all?
 *
 * A string test, not a parse: this runs on every render of the editor page,
 * and a sketch body is routinely a megabyte of JSON. tldraw's snapshot is
 * `JSON.stringify`'d, and every shape record carries `"typeName":"shape"`.
 */
export function sketchHasShapes(content) {
  return typeof content === 'string' && /"typeName"\s*:\s*"shape"/.test(content);
}

/**
 * The options tldraw's export is asked for, given the page bounds of the ink.
 *
 * `scale` is chosen so tldraw's own 2x render already fits in
 * EXPORT_MAX_EDGE; never above 1, because upscaling a small sketch adds
 * pixels, not legibility.
 */
export function sketchExportOptions(bounds) {
  const w = Math.max(1, bounds?.w || bounds?.width || 1);
  const h = Math.max(1, bounds?.h || bounds?.height || 1);
  const edge = Math.max(w, h) + EXPORT_PADDING * 2;
  const scale = Math.min(1, EXPORT_MAX_EDGE / (edge * TLDRAW_PIXEL_RATIO));
  return {
    background: false,
    darkMode: false,
    padding: EXPORT_PADDING,
    scale,
  };
}

/** `{ width, height }` scaled down (never up) so the longest edge is at most `max`. */
export function fitWithin(width, height, max = EXPORT_MAX_EDGE) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

async function defaultLoadImage(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode the exported page.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const defaultCreateCanvas = () => document.createElement('canvas');

/**
 * Draw `blob` onto an opaque white canvas no larger than `maxEdge`, as PNG.
 * The canvas and image loader are injectable (jsdom has no canvas).
 */
export async function flattenOnWhite(blob, {
  maxEdge = EXPORT_MAX_EDGE,
  loadImage = defaultLoadImage,
  createCanvas = defaultCreateCanvas,
} = {}) {
  const image = await loadImage(blob);
  const { width, height } = fitWithin(image.width, image.height, maxEdge);
  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = EXPORT_BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  image.close?.();
  const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new SketchExportError('encode', 'Could not turn the sketch into an image.');
  return { blob: png, width, height };
}

/** Bare base64 (no `data:` prefix) of a blob. */
export async function blobToBase64(blob) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? '' : dataUrl.slice(comma + 1);
}

/**
 * Export the current page of a tldraw editor as a white-backed PNG.
 *
 * @param {object} editor           a tldraw 2.4 Editor
 * @param {object} deps
 * @param {Function} deps.exportToBlob  tldraw's `exportToBlob`
 * @returns {Promise<{ blob: Blob, base64: string, mediaType: 'image/png', width: number, height: number }>}
 * @throws {SketchExportError} code `empty` | `too_large` | `encode`
 */
export async function exportSketchPng(editor, { exportToBlob, flatten = flattenOnWhite, toBase64 = blobToBase64 } = {}) {
  const ids = [...(editor.getCurrentPageShapeIds?.() || [])];
  if (!ids.length) {
    throw new SketchExportError('empty', 'This sketch is empty. Write something first.');
  }
  const opts = sketchExportOptions(editor.getCurrentPageBounds?.());

  let raw;
  try {
    raw = await exportToBlob({ editor, ids, format: 'png', opts });
  } catch (err) {
    throw new SketchExportError('encode', `Could not turn the sketch into an image (${err?.message || 'export failed'}).`);
  }
  const { blob, width, height } = await flatten(raw);

  if (blob.size > EXPORT_MAX_BYTES) {
    const mb = (blob.size / (1024 * 1024)).toFixed(1);
    throw new SketchExportError(
      'too_large',
      `This page is too big to send (${mb} MB as an image; the limit is 6 MB). Split it across two sketches.`
    );
  }

  return { blob, base64: await toBase64(blob), mediaType: 'image/png', width, height };
}
