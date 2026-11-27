/**
 * The barcode decoder for phones without one built in (every iPhone).
 *
 * zxing-cpp compiled to WebAssembly. This module is only ever reached through
 * `import()` from detector.js, so neither this code nor the ~0.9 MB .wasm is on
 * the app's first load: they arrive when the scanner first needs them.
 *
 * The .wasm is OUR file. `?url` makes Vite emit it as a hashed asset next to
 * the app's own chunks, the service worker precaches it (vite.config.js
 * `globPatterns`), and `locateFile` below points the loader at it. Left alone,
 * zxing-wasm fetches the binary from jsDelivr — which is the old unpkg problem
 * again: no signal in the shop, no scanner.
 */
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { normalizeProductCode } from './productCode.js';

prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  },
});

// Food packs carry EAN-13, EAN-8, UPC-A or UPC-E. Asking for nothing else is
// both faster and one less way to "read" a number that is not a product.
const FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE'];

const LIVE_OPTIONS = {
  formats: FORMATS,
  tryHarder: true,
  // The frame is already cropped to the guide box, so rotation is the one
  // extra pass worth paying for (a pack held sideways); inverted and
  // downscaled passes are not, ten times a second.
  tryRotate: true,
  tryInvert: false,
  tryDownscale: false,
  maxNumberOfSymbols: 1,
};

const PHOTO_OPTIONS = {
  formats: FORMATS,
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  maxNumberOfSymbols: 4,
};

const toReads = (results) =>
  results
    .filter((r) => r && r.isValid !== false && r.text)
    .map((r) => ({ rawValue: r.text, format: r.format }));

/** One camera frame (an ImageData) -> [{ rawValue, format }]. */
export const decodeFrame = async (imageData) => toReads(await readBarcodes(imageData, LIVE_OPTIONS));

// ─── Stills ────────────────────────────────────────────────────────────────

const loadPicture = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies the EXIF turn, so a portrait photo is upright.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() };
    } catch {
      // Older Safari rejects the options bag or the file type: use <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('That picture could not be opened.'));
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
};

/** Draw a region of the picture, shrunk so its long side is at most `maxSide`. */
const rasterize = (picture, region, maxSide) => {
  const scale = Math.min(1, maxSide / Math.max(region.w, region.h));
  const w = Math.max(1, Math.round(region.w * scale));
  const h = Math.max(1, Math.round(region.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(picture.source, region.x, region.y, region.w, region.h, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
};

/**
 * A photo from the phone's own camera -> [{ rawValue, format }].
 *
 * Three looks, cheapest first, stopping at the first that reads a product code:
 * the whole picture at a modest size (a barcode that fills the photo), the
 * whole picture near full size (a small barcode on a big pack), then the
 * middle of it at full size (people centre what they are photographing).
 * A 12-megapixel photo is never handed over whole — that is ~50 MB of pixels.
 */
export const decodePhoto = async (file) => {
  const picture = await loadPicture(file);
  try {
    const { width, height } = picture;
    if (!width || !height) return [];
    const whole = { x: 0, y: 0, w: width, h: height };
    const middle = {
      x: Math.round(width * 0.2),
      y: Math.round(height * 0.2),
      w: Math.round(width * 0.6),
      h: Math.round(height * 0.6),
    };
    const looks = [[whole, 1600]];
    if (Math.max(width, height) > 1600) {
      looks.push([whole, 3000]);
      looks.push([middle, 3000]);
    }
    for (const [region, maxSide] of looks) {
      const pixels = rasterize(picture, region, maxSide);
      if (!pixels) continue;
      const reads = toReads(await readBarcodes(pixels, PHOTO_OPTIONS));
      if (reads.some((r) => normalizeProductCode(r.rawValue, r.format))) return reads;
    }
    return [];
  } finally {
    picture.release();
  }
};
