/**
 * sketchImages.js — an image inserted or pasted into a sketch, made to fit
 * (review 1.18).
 *
 * tldraw embeds an inserted image in the snapshot as a data URL, at full
 * size: its `maxImageDimension` only shrinks the SHAPE on the page, never the
 * bytes. One 6 MB phone photo was enough to push the sketch past the 5 MB
 * snapshot ceiling, and from then on every save was refused with "Try
 * removing some strokes" — a message about strokes, for an image.
 *
 * So the sketch registers this as tldraw's asset handler for files:
 *   1. the image is decoded and scaled so its longest edge is at most 1600px,
 *      then re-encoded (JPEG, or PNG for a PNG that stays small);
 *   2. it is refused, BY NAME, if it would still be too big on its own or
 *      would push the sketch over the ceiling — before anything is inserted.
 *
 * Canvas and decoding are injectable: jsdom has neither.
 */
import { SNAPSHOT_CONTENT_MAX } from './saveGuards';

/** Longest edge kept in the sketch, in pixels (and tldraw's maxImageDimension). */
export const SKETCH_IMAGE_MAX_EDGE = 1600;
/** What tldraw is told it may hand us (`maxAssetSize`): a camera photo, before shrinking. */
export const SKETCH_IMAGE_INPUT_MAX_BYTES = 25 * 1024 * 1024;
/** One image's data URL, after shrinking, at most. */
export const SKETCH_IMAGE_MAX_CHARS = 1_500_000;
/** tldraw's own records around an image, roughly. */
const RECORD_OVERHEAD = 2_000;
const JPEG_QUALITY = 0.85;

export class SketchImageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SketchImageError';
    this.code = code;
  }
}

const mb = (chars) => (chars / (1024 * 1024)).toFixed(1);
const nameOf = (file) => (String(file?.name || '').trim() ? `“${String(file.name).trim()}”` : 'That image');

async function defaultLoadImage(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const defaultCreateCanvas = () => document.createElement('canvas');

/**
 * The image as the sketch will keep it, or a SketchImageError naming it.
 *
 * @param {File} file
 * @param {object} o
 * @param {number} o.currentChars  the sketch's saved size now (characters)
 * @returns {Promise<{ dataUrl: string, width: number, height: number, mimeType: string }>}
 */
export async function prepareSketchImage(file, {
  currentChars = 0,
  maxChars = SNAPSHOT_CONTENT_MAX,
  maxEdge = SKETCH_IMAGE_MAX_EDGE,
  loadImage = defaultLoadImage,
  createCanvas = defaultCreateCanvas,
} = {}) {
  const name = nameOf(file);
  if (!String(file?.type || '').startsWith('image/')) {
    throw new SketchImageError('type', `${name} is not an image, so it can't go in a sketch.`);
  }
  let image;
  try {
    image = await loadImage(file);
  } catch {
    throw new SketchImageError('decode', `${name} could not be opened. Try a JPEG or PNG.`);
  }
  const w0 = Math.max(1, Math.round(image.width || 1));
  const h0 = Math.max(1, Math.round(image.height || 1));
  const k = Math.min(1, maxEdge / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * k));
  const height = Math.max(1, Math.round(h0 * k));

  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const encode = (type, opaque) => {
    ctx.clearRect?.(0, 0, width, height);
    if (opaque) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL(type, type === 'image/jpeg' ? JPEG_QUALITY : undefined);
  };
  // A PNG (a screenshot, a diagram) keeps its edges and transparency when it
  // stays small; anything else, or a big PNG, becomes a JPEG on white.
  let mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  let dataUrl = encode(mimeType, mimeType === 'image/jpeg');
  if (mimeType === 'image/png' && dataUrl.length > SKETCH_IMAGE_MAX_CHARS / 2) {
    mimeType = 'image/jpeg';
    dataUrl = encode(mimeType, true);
  }
  image.close?.();

  if (dataUrl.length > SKETCH_IMAGE_MAX_CHARS) {
    throw new SketchImageError('too_big', `${name} is too big for a sketch (${mb(dataUrl.length)} MB even after shrinking it). Try a smaller image.`);
  }
  if (currentChars + dataUrl.length + RECORD_OVERHEAD > maxChars) {
    throw new SketchImageError(
      'sketch_full',
      `${name} would make this sketch too large to save (${mb(currentChars + dataUrl.length)} of ${mb(maxChars)} MB). Put it in a new sketch, or remove an image first.`
    );
  }
  return { dataUrl, width, height, mimeType };
}

/**
 * tldraw's `registerExternalAssetHandler('file', …)`, for a sketch.
 *
 * @param {object} deps
 * @param {() => number} deps.currentChars  the sketch's size now
 * @param {(message: string) => void} deps.onRefuse  say why, by name
 * @param {object} deps.AssetRecordType  tldraw's
 */
export function sketchImageHandler({ currentChars, onRefuse, AssetRecordType, prepare = prepareSketchImage }) {
  // Several files dropped at once are prepared side by side: each one counts
  // the ones accepted just before it, until the store has caught up.
  let reserved = 0;
  return async ({ file }) => {
    try {
      const out = await prepare(file, { currentChars: currentChars() + reserved });
      reserved += out.dataUrl.length;
      setTimeout(() => { reserved = Math.max(0, reserved - out.dataUrl.length); }, 5000);
      return AssetRecordType.create({
        id: AssetRecordType.createId(),
        type: 'image',
        typeName: 'asset',
        props: {
          name: String(file?.name || 'image'),
          src: out.dataUrl,
          w: out.width,
          h: out.height,
          mimeType: out.mimeType,
          isAnimated: false,
          fileSize: Math.round((out.dataUrl.length * 3) / 4),
        },
        meta: {},
      });
    } catch (err) {
      onRefuse?.(err instanceof SketchImageError ? err.message : `${nameOf(file)} could not be added to the sketch.`);
      throw err;
    }
  };
}
