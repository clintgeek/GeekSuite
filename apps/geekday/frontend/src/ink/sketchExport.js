/**
 * sketchExport.js — ink as an image a vision model can read.
 *
 * Copied from apps/notegeek/frontend/src/utils/sketchExport.js (GeekDay keeps
 * its own copy; apps do not import each other). Trimmed: no print export.
 * Added for the lasso: `minShortEdge` (a few circled words are exported large
 * enough to read) and `LASSO_MIN_SHORT_EDGE`.
 *
 * Two steps, both needed:
 *
 *   1. **tldraw's own export** (`exportToBlob`), not a screenshot, asked for
 *      light mode (`darkMode: false`), so dark-theme ink comes out dark.
 *   2. **Flattened onto white.** tldraw's `background: true` paints its own
 *      light page colour, and `false` leaves the PNG transparent, which a
 *      model reads as black. The export is drawn onto an opaque #ffffff canvas
 *      instead, which also enforces the longest-edge cap exactly.
 *
 * `exportToBlob` is passed in rather than imported, so this module stays free
 * of tldraw and testable in jsdom.
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
 * A lassoed crop's short side is exported at least this many pixels where the
 * selection allows: three circled words are ~40 page units tall, and at 2 px
 * per unit the model gets handwriting too small to read reliably.
 */
export const LASSO_MIN_SHORT_EDGE = 300;

/**
 * The options tldraw's export is asked for, given the page bounds of the ink.
 *
 * `scale` is chosen so tldraw's own 2x render already fits in `maxEdge`. For a
 * whole page it is never above 1 (NoteGeek's rule: upscaling a big sketch adds
 * pixels, not legibility). With `minShortEdge` a SMALL selection is rendered
 * larger, so its short side (padding included) reaches that many pixels: the
 * export is vector until it is rasterised, so this is real resolution. The
 * `maxEdge` cap always wins, so a long thin line of writing stays in bounds.
 */
export function sketchExportOptions(bounds, maxEdge = EXPORT_MAX_EDGE, { minShortEdge = 0 } = {}) {
  const w = Math.max(1, bounds?.w || bounds?.width || 1);
  const h = Math.max(1, bounds?.h || bounds?.height || 1);
  const long = Math.max(w, h) + EXPORT_PADDING * 2;
  const short = Math.min(w, h) + EXPORT_PADDING * 2;
  const cap = maxEdge / (long * TLDRAW_PIXEL_RATIO);
  const wanted = minShortEdge > 0 ? Math.max(1, minShortEdge / (short * TLDRAW_PIXEL_RATIO)) : 1;
  return {
    background: false,
    darkMode: false,
    padding: EXPORT_PADDING,
    scale: Math.min(wanted, cap),
  };
}

/**
 * Below this many image pixels per page unit, handwriting written at 100%
 * comes out roughly 10px tall or less, and the model's reading falls apart
 * (review 2.7). A page this long is still sent — but the status line says so.
 */
export const MIN_READABLE_SCALE = 0.5;

/** Image pixels per page unit the model gets for ink with these bounds. */
export function readableScale(bounds, maxEdge = EXPORT_MAX_EDGE) {
  const w = Math.max(1, bounds?.w || bounds?.width || 1);
  const h = Math.max(1, bounds?.h || bounds?.height || 1);
  return Math.min(TLDRAW_PIXEL_RATIO, maxEdge / (Math.max(w, h) + EXPORT_PADDING * 2));
}

/** Is the page too long (or wide) for one image to keep its handwriting legible? */
export const tooLongToRead = (bounds, maxEdge = EXPORT_MAX_EDGE) => readableScale(bounds, maxEdge) < MIN_READABLE_SCALE;

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
 * @param {Array} [deps.ids]        only these shapes (default: the whole page)
 * @param {number} [deps.maxEdge]   longest edge in pixels (print asks for more)
 * @param {number} [deps.maxBytes]  refused past this; `Infinity` for print,
 *   which never leaves the device
 * @param {boolean} [deps.base64=true]
 * @param {number} [deps.minShortEdge]  see sketchExportOptions (the lasso)
 * @returns {Promise<{ blob: Blob, base64: string, mediaType: 'image/png', width: number, height: number, tooLong: boolean }>}
 * @throws {SketchExportError} code `empty` | `too_large` | `encode`
 */
export async function exportSketchPng(editor, {
  exportToBlob,
  flatten = flattenOnWhite,
  toBase64 = blobToBase64,
  ids: only = null,
  maxEdge = EXPORT_MAX_EDGE,
  maxBytes = EXPORT_MAX_BYTES,
  base64 = true,
  minShortEdge = 0,
} = {}) {
  const ids = only ? [...only] : [...(editor.getCurrentPageShapeIds?.() || [])];
  if (!ids.length) {
    throw new SketchExportError('empty', 'There is no writing to read here.');
  }
  const bounds = only ? unionBounds(ids.map((id) => editor.getShapePageBounds?.(id))) : editor.getCurrentPageBounds?.();
  const opts = sketchExportOptions(bounds, maxEdge, { minShortEdge });

  let raw;
  try {
    raw = await exportToBlob({ editor, ids, format: 'png', opts });
  } catch (err) {
    throw new SketchExportError('encode', `Could not turn the sketch into an image (${err?.message || 'export failed'}).`);
  }
  const { blob, width, height } = await flatten(raw, { maxEdge });

  if (blob.size > maxBytes) {
    const mb = (blob.size / (1024 * 1024)).toFixed(1);
    throw new SketchExportError(
      'too_large',
      `That is too much writing to send at once (${mb} MB as an image; the limit is 6 MB). Circle a smaller part.`
    );
  }

  return {
    blob, base64: base64 ? await toBase64(blob) : '', mediaType: 'image/png', width, height,
    tooLong: tooLongToRead(bounds, maxEdge),
  };
}

/** `{ w, h }` of the smallest box holding every one of `boxes` (nulls skipped). */
export function unionBounds(boxes) {
  const real = boxes.filter(Boolean);
  if (!real.length) return null;
  const minX = Math.min(...real.map((b) => b.x ?? b.minX ?? 0));
  const minY = Math.min(...real.map((b) => b.y ?? b.minY ?? 0));
  const maxX = Math.max(...real.map((b) => (b.x ?? b.minX ?? 0) + (b.w ?? b.width ?? 0)));
  const maxY = Math.max(...real.map((b) => (b.y ?? b.minY ?? 0) + (b.h ?? b.height ?? 0)));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
