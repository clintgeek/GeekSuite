/**
 * photoPages.js — photographed notebook pages, made ready to read and to keep
 * (DOCS/HANDWRITING.md §3).
 *
 * A phone photo arrives as a 4000px, 3–6 MB JPEG (or a HEIC), possibly lying
 * on its side with an EXIF flag saying which way is up. Each page is:
 *
 *   1. decoded with the EXIF rotation honoured
 *      (`createImageBitmap(file, { imageOrientation: 'from-image' })`, and an
 *      <img> for browsers that refuse the option or the format);
 *   2. turned by the writer's own rotation, in 90° steps;
 *   3. scaled down (never up) to at most 2000px on the longest edge;
 *   4. flattened onto white and re-encoded as JPEG at 0.85.
 *
 * The same prepared JPEG is what the model reads and what the photo sketch
 * note keeps, so what Chef marks up is exactly what was transcribed.
 *
 * Everything that touches the browser (decoding, canvas, FileReader) is
 * injectable, so the arithmetic is testable in jsdom, which has no canvas.
 */
import { fitWithin, blobToBase64 } from './sketchExport';
import { SNAPSHOT_CONTENT_MAX } from './saveGuards';

/** Pages in one photo note. The 5 MB snapshot ceiling is why (see "Size" in §3). */
export const PHOTO_MAX_PAGES = 8;

/** The longest edge of a prepared page, in pixels. */
export const PHOTO_MAX_EDGE = 2000;

export const PHOTO_JPEG_QUALITY = 0.85;

export const PHOTO_MEDIA_TYPE = 'image/jpeg';

export const PHOTO_BACKGROUND = '#ffffff';

/**
 * What the snapshot costs beyond the images themselves, in characters.
 * Measured on real snapshots built by `photoSketchSnapshot.js` (the test
 * `photoSketchSnapshot.test.js` holds these to the real numbers): the
 * document, page and schema records, then one asset and one image shape per
 * page. Rounded up, so the estimate errs on the side of refusing.
 */
export const SNAPSHOT_BASE_CHARS = 4000;
export const SNAPSHOT_PER_PAGE_CHARS = 1000;

export class PhotoPageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PhotoPageError';
    this.code = code;
  }
}

// ── Rotation ────────────────────────────────────────────────────────────────

/** Any angle, as one of 0, 90, 180, 270 (clockwise). */
export function normalizeRotation(deg) {
  const n = Math.round((Number(deg) || 0) / 90) * 90;
  return ((n % 360) + 360) % 360;
}

/** The next rotation a quarter-turn clockwise (or anticlockwise for step -90). */
export function rotateBy(rotation, step = 90) {
  return normalizeRotation(normalizeRotation(rotation) + step);
}

/** `{ width, height }` of a `width × height` image once turned by `rotation`. */
export function rotatedSize(width, height, rotation) {
  const r = normalizeRotation(rotation);
  return r === 90 || r === 270 ? { width: height, height: width } : { width, height };
}

/**
 * The output canvas size and how to draw into it: the decoded image scaled
 * to fit PHOTO_MAX_EDGE (rotation does not change the longest edge), then
 * turned. `draw` is the image's drawn size before the turn.
 */
export function preparedGeometry(srcWidth, srcHeight, rotation, maxEdge = PHOTO_MAX_EDGE) {
  const draw = fitWithin(srcWidth, srcHeight, maxEdge);
  const canvas = rotatedSize(draw.width, draw.height, rotation);
  return { canvas, draw, rotation: normalizeRotation(rotation) };
}

// ── The page limit ──────────────────────────────────────────────────────────

/**
 * How many of `adding` new photos fit beside `current` pages, and what to say
 * about the rest. Never more than PHOTO_MAX_PAGES in all.
 */
export function acceptPages(current, adding, max = PHOTO_MAX_PAGES) {
  const room = Math.max(0, max - Math.max(0, current));
  const accepted = Math.min(room, Math.max(0, adding));
  const refused = Math.max(0, adding) - accepted;
  let message = null;
  if (refused > 0) {
    message = accepted > 0
      ? `A note holds up to ${max} pages, so ${refused === 1 ? 'the last photo was' : `the last ${refused} photos were`} not added.`
      : `A note holds up to ${max} pages. Remove one to add another.`;
  }
  return { accepted, refused, message };
}

// ── Size ────────────────────────────────────────────────────────────────────

/** Characters of `data:image/jpeg;base64,…` for a blob of `bytes` bytes. */
export function dataUrlChars(bytes, mediaType = PHOTO_MEDIA_TYPE) {
  return `data:${mediaType};base64,`.length + Math.ceil(Math.max(0, bytes) / 3) * 4;
}

/** An upper estimate of the photo sketch note's snapshot, in characters. */
export function estimateSnapshotChars(pages) {
  return (pages || []).reduce(
    (sum, p) => sum + SNAPSHOT_PER_PAGE_CHARS + dataUrlChars(p?.bytes || 0),
    SNAPSHOT_BASE_CHARS
  );
}

const mb = (chars) => (chars / 1_000_000).toFixed(1);

/**
 * Does a set of pages fit in one note? `chars` is an exact snapshot length
 * when one is given (the check made just before saving), else the estimate
 * (the tray's running meter). The gateway counts characters of `content`.
 */
export function photoSizeCheck(pages, { chars, max = SNAPSHOT_CONTENT_MAX } = {}) {
  const size = Number.isFinite(chars) ? chars : estimateSnapshotChars(pages);
  const ok = size <= max;
  return {
    chars: size,
    max,
    ok,
    label: `${mb(size)} of ${mb(max)} MB`,
    message: ok
      ? null
      : `These pages are too big for one note (${mb(size)} MB; the limit is ${mb(max)} MB). Remove a page, or split them across two notes.`,
  };
}

// ── Transcripts ─────────────────────────────────────────────────────────────

/**
 * The per-page readings as one transcript. One page is its text alone; two
 * or more are headed `--- page N ---`, in page order.
 */
export function joinPageTranscripts(texts) {
  const list = (texts || []).map((t) => String(t ?? '').trim());
  if (list.length <= 1) return list[0] || '';
  return list.map((t, i) => `--- page ${i + 1} ---\n${t}`).join('\n\n');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The photo sketch note's title: the writer's, or "Photos · 27 Sep 2026". */
export function photoNoteTitle(userTitle, date = new Date()) {
  const own = String(userTitle || '').trim();
  if (own) return own.slice(0, 500);
  // By hand, not toLocaleDateString: ICU versions disagree ("Sep" / "Sept").
  return `Photos · ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// ── Decoding and encoding (browser) ─────────────────────────────────────────

const looksLikeHeic = (file) => /hei[cf]/i.test(`${file?.type || ''} ${file?.name || ''}`);

export function undecodableMessage(file) {
  const name = file?.name ? ` (${file.name})` : '';
  return looksLikeHeic(file)
    ? `This browser can't open HEIC photos${name}. Set the camera to save JPEG ("Most compatible"), or take the photo from here.`
    : `This browser can't open that image${name}. Try a JPEG or PNG photo.`;
}

function loadViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // Browsers apply EXIF orientation to <img> by default
    // (`image-orientation: from-image`), so this path is upright too.
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

/**
 * Decode a photo, upright. Order:
 *   1. createImageBitmap with `imageOrientation: 'from-image'`;
 *   2. without the options bag, for a browser that rejects it (a TypeError);
 *   3. an <img>, which honours EXIF by default.
 * If none can read it, a PhotoPageError('decode') with a plain message.
 */
export async function decodePhoto(file, {
  createBitmap = typeof createImageBitmap === 'function' ? createImageBitmap : null,
  loadImage = loadViaImg,
} = {}) {
  if (createBitmap) {
    try {
      return await createBitmap(file, { imageOrientation: 'from-image' });
    } catch (err) {
      if (err?.name === 'TypeError') {
        try {
          return await createBitmap(file);
        } catch {
          // fall through to <img>
        }
      }
    }
  }
  try {
    return await loadImage(file);
  } catch {
    throw new PhotoPageError('decode', undecodableMessage(file));
  }
}

const defaultCreateCanvas = () => document.createElement('canvas');

/**
 * One photo, prepared: upright, turned by `rotation`, at most 2000px, JPEG
 * 0.85 on white.
 *
 * @returns {Promise<{ blob: Blob, bytes: number, width: number, height: number, base64: string, dataUrl: string }>}
 */
export async function preparePhotoPage(file, rotation = 0, {
  decode = decodePhoto,
  createCanvas = defaultCreateCanvas,
  toBase64 = blobToBase64,
  maxEdge = PHOTO_MAX_EDGE,
  quality = PHOTO_JPEG_QUALITY,
} = {}) {
  const image = await decode(file);
  const srcW = image.width || image.naturalWidth;
  const srcH = image.height || image.naturalHeight;
  if (!srcW || !srcH) throw new PhotoPageError('decode', undecodableMessage(file));
  const { canvas: size, draw, rotation: r } = preparedGeometry(srcW, srcH, rotation, maxEdge);

  const canvas = createCanvas();
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  // JPEG has no alpha: a transparent PNG would otherwise come out black.
  ctx.fillStyle = PHOTO_BACKGROUND;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(size.width / 2, size.height / 2);
  ctx.rotate((r * Math.PI) / 180);
  ctx.drawImage(image, -draw.width / 2, -draw.height / 2, draw.width, draw.height);
  image.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, PHOTO_MEDIA_TYPE, quality));
  if (!blob) throw new PhotoPageError('encode', 'Could not prepare that photo. Try taking it again.');
  const base64 = await toBase64(blob);
  return {
    blob,
    bytes: blob.size,
    width: size.width,
    height: size.height,
    base64,
    dataUrl: `data:${PHOTO_MEDIA_TYPE};base64,${base64}`,
  };
}
