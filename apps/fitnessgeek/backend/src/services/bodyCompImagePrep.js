// bodyCompImagePrep — turn a stored body-composition upload (a validated,
// sniffed file already on disk via bodyCompUploadStorage.js) into the
// vision-ready image parts bodyCompExtractionService hands to aiGeek.
//
// Two shapes come in, per DOCS/BODY_COMPOSITION_INTAKE.md §4 and §10.4:
//
//   1. A JPEG/PNG/WebP image. Usually a normal, single-image screenshot that
//      passes straight through untouched. The one exception is the "tall
//      screenshot" case: Arboleaf's PNG export is really JPEG bytes at
//      1080 x 10037 (§4's own measured sample). A vision API downscales to
//      a maximum long edge (~1568px for the models this app talks to), so a
//      10,000px-tall image arrives roughly 6x reduced and unreadable. That
//      shape MUST be sliced into pieces short enough to survive the
//      downscale, capped at MAX_IMAGES_PER_REQUEST per §4 (verified during
//      the doc's own design pass: 8 chunks was what it took to read it).
//
//   2. A PDF. §4 also established (via `pdfimages -list`) that each page of
//      the Arboleaf PDF export is a SINGLE embedded image, not a
//      text-plus-vector page that needs rasterising. Page 1 carries the
//      complete dataset. So the right move is not "render the PDF page to a
//      bitmap" (which would need a PDF rasteriser — a genuinely heavy,
//      usually-native dependency) but "reach into the PDF's own object
//      graph and pull the embedded image stream back out," exactly what
//      `pdfimages` itself does. See `extractPdfPageOneImage` below for the
//      mechanics and its docstring for the one format this does NOT cover.
//
// DEPENDENCY CHOICES — both matter because the backend runs on
// `node:20-alpine` (apps/fitnessgeek/backend/Dockerfile) with no image
// tooling baked in, and the task authorizing this file was explicit that a
// new dependency must be pure JavaScript with no native build step:
//
//   - `jimp` (pure JS; its codecs — @jimp/js-jpeg, @jimp/js-png, … — are all
//     JS, no native addon, confirmed against the published dependency tree
//     before adding it) does the image decode/crop/re-encode for slicing.
//   - `pdf-lib` (pure JS; its only runtime deps are `pako`, a pure-JS zlib,
//     and `tslib`) does the PDF object-graph walk. It is NOT used to
//     rasterise — `PDFDocument.load` plus a manual walk to the page's
//     `XObject` resources is enough to reach the raw stream bytes, and
//     `pdf-lib` never decodes those bytes itself, which is exactly the
//     property this file relies on (see below).
//
// Neither pulls in a native binary, so neither touches the Dockerfile — the
// one thing this task was explicitly not allowed to do.

import { Jimp, JimpMime } from 'jimp';
import { PDFDocument, PDFName, PDFArray, PDFDict } from 'pdf-lib';
import zlib from 'zlib';
import logger from '../config/logger.js';

/**
 * Mirrors `MAX_IMAGES_PER_REQUEST` in
 * apps/basegeek/packages/api/src/services/ai/adapters/imageContent.js — the
 * aiGeek front door's own budget for images on one request. Restated rather
 * than imported for the same cross-app-boundary reason `aiGeekClient.js`'s
 * `imagePart()` gives in its own header: this backend cannot reach across
 * into basegeek's package tree. Keep the two numbers in sync if either
 * changes; a caller that slices into more pieces than the front door will
 * accept just gets `TOO_MANY_IMAGES` back from aiGeek, so drift here isn't
 * silent, but it is a wasted round trip worth avoiding.
 */
export const MAX_IMAGES_PER_REQUEST = 8;

/**
 * The two thresholds that decide "very tall," together rather than either
 * alone. Height alone would slice a big-but-normal portrait photo (a phone
 * shot of the scale's own screen, say 3000x4000 — ratio 1.33) for no
 * reason; aspect ratio alone would slice a tiny thumbnail with an unlucky
 * shape. The Arboleaf report screenshot this exists for is 1080 x 10037 —
 * ratio ~9.3 — so a ratio of 2 with a floor on absolute height is generous
 * headroom above any legitimate photo while still catching that shape.
 */
const TALL_HEIGHT_PX = 1600;
const TALL_ASPECT_RATIO = 2;

function looksVeryTall(width, height) {
  return height > TALL_HEIGHT_PX && height > width * TALL_ASPECT_RATIO;
}

/** Image formats this module can decode well enough to check tallness and slice. */
const DECODABLE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);

/**
 * Slice a decoded image into at most `MAX_IMAGES_PER_REQUEST` horizontal
 * bands, each short enough on its own to survive a vision API's downscale.
 *
 * Sized to land on exactly the right chunk count without a caller having to
 * guess: dividing the full height by the max chunk count gives a slice
 * height that, multiplied back out, always covers the whole image in `<=`
 * `MAX_IMAGES_PER_REQUEST` pieces — for the reference 10,037px screenshot,
 * that's `ceil(10037 / 8) = 1255`px per slice, in exactly 8 pieces, matching
 * the count BODY_COMPOSITION_INTAKE.md §4 says it took to read it by hand.
 *
 * @param {InstanceType<typeof Jimp>} image - already decoded
 * @param {string} outputMediaType - what to re-encode each slice as
 * @returns {Promise<Array<{mediaType:string, data:string}>>} base64 slices, top to bottom
 */
async function sliceTallImage(image, outputMediaType) {
  const { width, height } = image.bitmap;
  const outMime = outputMediaType === 'image/png' ? JimpMime.png : JimpMime.jpeg;
  const sliceHeight = Math.ceil(height / MAX_IMAGES_PER_REQUEST);

  const slices = [];
  for (let y = 0; y < height; y += sliceHeight) {
    const h = Math.min(sliceHeight, height - y);
    // `.clone()` first — jimp's `crop` mutates the receiver in place, and
    // every slice after the first needs the ORIGINAL full image, not the
    // previous slice's already-cropped remnant.
    const chunk = image.clone().crop({ x: 0, y, w: width, h });
    const buffer = await chunk.getBuffer(outMime);
    slices.push({ mediaType: outMime, data: buffer.toString('base64') });
  }
  return slices;
}

/**
 * Prepare a raster image (JPEG/PNG/WebP/GIF) for extraction: slice it if
 * it's the "tall screenshot" shape, otherwise hand the original bytes back
 * untouched.
 *
 * Passing the ORIGINAL buffer through on the untouched path (rather than a
 * jimp decode/re-encode round trip) is deliberate — it costs nothing and
 * avoids a recompression pass on the common case, where the file is already
 * a normal, single-page-sized report image.
 *
 * @param {Buffer} buffer
 * @param {string} mimeType - sniffed, not client-declared (fileSniff.js)
 * @returns {Promise<{ok:true, images: Array<{mediaType:string,data:string}>} | {ok:false, code:string, message:string}>}
 */
async function prepareRasterImage(buffer, mimeType) {
  if (!DECODABLE_MIME_TYPES.has(mimeType)) {
    // WebP has no decoder in jimp's default codec set (no @jimp/js-webp in
    // its dependency tree) — see the module header. Without a decode we
    // cannot check whether it needs slicing, but the untouched-passthrough
    // is still the right answer for a normal-sized file, which is what a
    // WebP share overwhelmingly will be (nothing in the Arboleaf report path
    // produces a WebP at all today — this branch exists for the sniffer's
    // general allowlist, not because Arboleaf ever emits one). If it turns
    // out to genuinely be an unreadable tall WebP, the arithmetic gate downstream
    // catches the fallout: `checked` comes back near zero and the caller
    // must not treat that as a clean pass (see bodyCompExtractionService.js).
    logger.info({ mimeType }, 'bodyCompImagePrep: no decoder for this format, passing through unsliced');
    return { ok: true, images: [{ mediaType: mimeType, data: buffer.toString('base64') }] };
  }

  let image;
  try {
    image = await Jimp.read(buffer);
  } catch (error) {
    logger.error({ mimeType, err: error?.message }, 'bodyCompImagePrep: could not decode image');
    return { ok: false, code: 'IMAGE_DECODE_FAILED', message: 'Could not read the uploaded image.' };
  }

  if (!looksVeryTall(image.bitmap.width, image.bitmap.height)) {
    return { ok: true, images: [{ mediaType: mimeType, data: buffer.toString('base64') }] };
  }

  try {
    const images = await sliceTallImage(image, mimeType);
    logger.info(
      { mimeType, width: image.bitmap.width, height: image.bitmap.height, slices: images.length },
      'bodyCompImagePrep: sliced a tall image',
    );
    return { ok: true, images };
  } catch (error) {
    logger.error({ err: error?.message }, 'bodyCompImagePrep: failed to slice a tall image');
    return { ok: false, code: 'IMAGE_SLICE_FAILED', message: 'Could not slice the uploaded image.' };
  }
}

/**
 * Extract page 1's embedded image stream from an Arboleaf PDF export,
 * WITHOUT rasterising the page.
 *
 * Why this works, and why it is the right approach rather than a
 * PDF-to-bitmap renderer: BODY_COMPOSITION_INTAKE.md §4 established with
 * `pdfimages -list` that each page of the report is a single embedded image
 * object, not a text/vector page — so "render the page" and "hand back the
 * one image already sitting inside it" produce the identical pixels, and
 * the second one is a graph walk instead of a rasterisation engine (which
 * would be a heavy, usually-native dependency this task is not allowed to
 * add). `pdf-lib` never decodes a stream's content when it PARSES a file —
 * `PDFRawStream.getContents()` hands back exactly the bytes stored between
 * `stream`/`endstream` in the file, whatever filter encoded them. For an
 * image whose filter chain ends in `DCTDecode`, those bytes ARE a complete,
 * valid JPEG file already — that is what `DCTDecode` *means* (the "decoded"
 * form of a DCT-filtered stream is the JPEG bitstream itself; a JPEG
 * decoder, not `pdf-lib`, turns that into pixels), and it is exactly what
 * lets `pdfimages -j` dump one out verbatim with no re-encoding. This was
 * verified end-to-end before writing this function: embedding a real JPEG
 * into a fresh PDF via `pdf-lib`'s own `embedJpg`, then walking back through
 * `PDFDocument.load` -> page Resources -> XObject -> `getContents()`,
 * reproduced the original JPEG bytes byte-for-byte.
 *
 * WHAT THIS DOES NOT COVER: an embedded image filtered as anything other
 * than `DCTDecode` (optionally behind a `FlateDecode` transport wrapper,
 * which IS unwrapped below with Node's built-in `zlib` — no extra
 * dependency needed for that part). A raw `FlateDecode` bitmap, `JPXDecode`
 * (JPEG2000) or `CCITTFaxDecode` (fax/bilevel) image would need a real image
 * ENCODER to turn back into a file format a vision API accepts, which is a
 * meaningfully bigger, riskier piece of work than reading bytes back out —
 * and no pure-JS, alpine-safe, dependency-light option for it was found. So
 * this fails loudly and specifically instead of guessing. This is a
 * deliberate, narrower scope than "every possible PDF," not an oversight —
 * see the delivery report for why DCTDecode is the expected case here.
 *
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{ok:true, images: Array<{mediaType:string,data:string}>} | {ok:false, code:string, message:string}>}
 */
/**
 * Turn an inflated FlateDecode image stream into a real JPEG.
 *
 * A DCTDecode stream is already a JPEG file and can be handed over untouched.
 * A FlateDecode one cannot: after inflation it is a bare grid of colour
 * samples with no header, no dimensions and no format — everything needed to
 * interpret it lives in the XObject's dictionary rather than in the bytes.
 * This reads that dictionary and re-encodes.
 *
 * Only the shape a real report actually uses is supported: 8 bits per
 * component, and either 3 components (RGB — `/DeviceRGB`, or an `/ICCBased`
 * profile with `/N 3`, which is what Arboleaf emits) or 1 (greyscale).
 * Anything else — 1-bit bitmaps, CMYK, indexed palettes, 16-bit — bails with
 * the same clear error as an unsupported codec rather than guessing at a
 * layout and producing a picture of noise for the model to hallucinate over.
 *
 * Re-encoded as JPEG rather than PNG deliberately: this is a photograph-free
 * document image of ~1714x2797, which PNG stores losslessly at several MB
 * while JPEG at high quality lands under a megabyte and stays well inside the
 * per-image budget. Quality is kept high because the model has to READ small
 * printed digits off it — this is the one place where compression artefacts
 * would turn into wrong numbers.
 *
 * @param {Buffer} samples - the inflated stream
 * @param {import('pdf-lib').PDFDict} dict - the image XObject's dictionary
 */
async function encodeRawSamples(samples, dict) {
  const numberOf = (key) => {
    const v = dict.lookup(PDFName.of(key));
    return typeof v?.asNumber === 'function' ? v.asNumber() : null;
  };

  const width = numberOf('Width');
  const height = numberOf('Height');
  const bpc = numberOf('BitsPerComponent');

  if (!width || !height || bpc !== 8) {
    return {
      ok: false,
      code: 'PDF_UNSUPPORTED_IMAGE_FORMAT',
      message: 'The PDF embedded image uses a sample format we cannot decode. Share the JPEG/PNG export from Arboleaf instead.',
    };
  }

  // Components are inferred from the actual byte count rather than parsed out
  // of the colour space, because `/ColorSpace` can be a direct name, an
  // indirect reference, or an `/ICCBased` array whose `/N` lives in yet
  // another stream's dictionary. The sample count cannot lie: an 8-bit image
  // is exactly width * height * components bytes.
  const components = samples.length / (width * height);
  if (components !== 3 && components !== 1) {
    return {
      ok: false,
      code: 'PDF_UNSUPPORTED_IMAGE_FORMAT',
      message: 'The PDF embedded image uses an unsupported colour layout. Share the JPEG/PNG export from Arboleaf instead.',
    };
  }

  // Jimp wants RGBA. Widen in one pre-allocated pass — this runs over roughly
  // 14 MB of samples for a report page and a per-pixel push would churn.
  const rgba = Buffer.allocUnsafe(width * height * 4);
  for (let px = 0, s = 0, d = 0; px < width * height; px += 1) {
    const r = samples[s];
    const g = components === 3 ? samples[s + 1] : r;
    const b = components === 3 ? samples[s + 2] : r;
    rgba[d] = r; rgba[d + 1] = g; rgba[d + 2] = b; rgba[d + 3] = 255;
    s += components; d += 4;
  }

  try {
    const image = Jimp.fromBitmap({ data: rgba, width, height });
    const jpeg = await image.getBuffer('image/jpeg', { quality: 90 });
    return { ok: true, images: [{ mediaType: 'image/jpeg', data: jpeg.toString('base64') }] };
  } catch (error) {
    logger.error({ err: error?.message }, 'bodyCompImagePrep: could not re-encode PDF raw samples');
    return {
      ok: false,
      code: 'PDF_UNSUPPORTED_IMAGE_FORMAT',
      message: 'Could not re-encode the PDF embedded image. Share the JPEG/PNG export from Arboleaf instead.',
    };
  }
}

async function extractPdfPageOneImage(pdfBuffer) {
  // Everything below — not just the initial `load` — is wrapped in one
  // outer try/catch. pdf-lib's parser is permissive: genuinely malformed
  // input does not always fail AT `load()`, it can fail later the first time
  // something touches the broken object graph (`getPageCount()`,
  // `Resources()`, …), and every one of those is just as much a "could not
  // read this PDF" outcome as a `load()` throw is.
  let pdfDoc;
  try {
    // `ignoreEncryption` and `updateMetadata: false`: we are reading, never
    // writing, and a report PDF from a consumer scale app has no reason to
    // be encrypted, but a stray password-protected file should fail with a
    // clear parse error rather than an opaque throw.
    pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true, updateMetadata: false });

    if (pdfDoc.getPageCount() < 1) {
      return { ok: false, code: 'PDF_NO_PAGES', message: 'The PDF has no pages.' };
    }
  } catch (error) {
    logger.error({ err: error?.message }, 'bodyCompImagePrep: PDF failed to parse');
    return { ok: false, code: 'PDF_PARSE_FAILED', message: 'Could not read the PDF file.' };
  }

  // Page 1 carries the complete dataset — DOCS/BODY_COMPOSITION_INTAKE.md §4/§10.4.
  const page = pdfDoc.getPage(0);

  let xobjectDict;
  try {
    const resources = page.node.Resources();
    xobjectDict = resources?.lookup(PDFName.of('XObject'), PDFDict) ?? null;
  } catch (error) {
    xobjectDict = null;
  }

  if (!xobjectDict || xobjectDict.keys().length === 0) {
    return { ok: false, code: 'PDF_NO_EMBEDDED_IMAGE', message: 'No embedded image found on page 1 of the PDF.' };
  }

  // The report is verified to carry exactly one image per page. If more than
  // one XObject somehow turns up (a thumbnail, a soft mask), the real page
  // image is overwhelmingly the largest one by encoded byte size — nothing
  // else on a report page is anywhere close to full-page size.
  let best = null;
  for (const key of xobjectDict.keys()) {
    const ref = xobjectDict.get(key);
    const stream = pdfDoc.context.lookup(ref);
    if (!stream || typeof stream.getContents !== 'function' || !stream.dict) continue;
    const contents = stream.getContents();
    if (!best || contents.length > best.contents.length) {
      best = { stream, contents };
    }
  }

  if (!best) {
    return { ok: false, code: 'PDF_NO_EMBEDDED_IMAGE', message: 'No embedded image stream found on page 1 of the PDF.' };
  }

  const filterEntry = best.stream.dict.lookup(PDFName.of('Filter'));
  const filterNames = (
    filterEntry instanceof PDFArray ? filterEntry.asArray() : filterEntry ? [filterEntry] : []
  ).map((name) => name.toString().replace(/^\//, ''));

  if (filterNames.length === 0) {
    return { ok: false, code: 'PDF_UNSUPPORTED_IMAGE_FORMAT', message: 'The PDF embedded image has no recognizable filter.' };
  }

  // Everything but the last filter is a transport wrapper around the image
  // codec itself; unwrap those (only FlateDecode is supported — it's the
  // only one Node's built-in zlib can undo with no new dependency).
  const codecFilter = filterNames[filterNames.length - 1];
  const transportFilters = filterNames.slice(0, -1);

  let bytes = Buffer.from(best.contents);
  for (const transportFilter of transportFilters) {
    if (transportFilter !== 'FlateDecode') {
      return {
        ok: false,
        code: 'PDF_UNSUPPORTED_IMAGE_FORMAT',
        message: `The PDF embedded image uses an unsupported filter chain (${filterNames.join(', ')}).`,
      };
    }
    try {
      bytes = zlib.inflateSync(bytes);
    } catch (error) {
      return {
        ok: false,
        code: 'PDF_UNSUPPORTED_IMAGE_FORMAT',
        message: 'Could not decode the PDF embedded image (bad FlateDecode transport wrapper).',
      };
    }
  }

  // FlateDecode as the TERMINAL filter is what Arboleaf actually produces —
  // confirmed by running the real vendor PDF through this function, which is
  // also how we learned the DCTDecode-only version below was not enough. The
  // stream is not an image file at that point, it is raw pixel samples, so it
  // has to be re-encoded rather than handed straight over.
  if (codecFilter === 'FlateDecode') {
    // The loop above only unwraps filters BEFORE the codec. When FlateDecode
    // is itself the terminal filter the bytes are still compressed at this
    // point, so inflate here — otherwise `encodeRawSamples` is handed 431 KB
    // of deflate stream and concludes the colour layout is impossible.
    let samples;
    try {
      samples = zlib.inflateSync(bytes);
    } catch (error) {
      return {
        ok: false,
        code: 'PDF_UNSUPPORTED_IMAGE_FORMAT',
        message: 'Could not decompress the PDF embedded image.',
      };
    }
    return encodeRawSamples(samples, best.stream.dict);
  }

  if (codecFilter !== 'DCTDecode') {
    // JPXDecode (JPEG 2000) and CCITTFaxDecode still need a decoder we do not
    // have, and neither has shown up in a real report.
    return {
      ok: false,
      code: 'PDF_UNSUPPORTED_IMAGE_FORMAT',
      message: `The PDF's embedded image uses an unsupported format (${codecFilter}). Share the JPEG/PNG export from Arboleaf instead.`,
    };
  }

  // A DCTDecode stream's raw bytes ARE a complete JPEG file — see the
  // docstring above. The PDF page (1714 x 2797 per §4's own measured sample)
  // is well under the "very tall" thresholds, so page-1 extraction never
  // needs slicing; if some future report export is both a PDF AND absurdly
  // tall, this would need the same slicing pass `prepareRasterImage` runs —
  // not needed for the shape this feature was built against.
  return { ok: true, images: [{ mediaType: 'image/jpeg', data: bytes.toString('base64') }] };
}

/**
 * The one entry point: turn a stored upload into the image content-parts
 * `bodyCompExtractionService` attaches to its aiGeek call.
 *
 * @param {{buffer: Buffer, mimeType: string}} upload
 * @returns {Promise<{ok:true, images: Array<{mediaType:string,data:string}>} | {ok:false, code:string, message:string}>}
 */
export async function prepareImagesForExtraction({ buffer, mimeType }) {
  if (mimeType === 'application/pdf') {
    return extractPdfPageOneImage(buffer);
  }
  return prepareRasterImage(buffer, mimeType);
}

export default { prepareImagesForExtraction, MAX_IMAGES_PER_REQUEST };
