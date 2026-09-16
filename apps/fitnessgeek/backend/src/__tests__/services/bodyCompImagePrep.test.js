// bodyCompImagePrep — real jimp/pdf-lib exercises, no mocking.
//
// Both dependencies are pure JS with no native step (see the module's own
// header for why that mattered), so there's nothing here that needs a
// double: a real tall JPEG really does get sliced, a real PDF with a
// DCTDecode image really does extract verbatim, and a real PDF with a
// FlateDecode image really does re-encode into something readable.

import { describe, test, expect } from '@jest/globals';
import { Jimp, JimpMime } from 'jimp';
import { PDFDocument, PDFName } from 'pdf-lib';
import zlib from 'zlib';
import { prepareImagesForExtraction, MAX_IMAGES_PER_REQUEST } from '../../services/bodyCompImagePrep.js';

/** A small solid-color JPEG/PNG, cheap to generate and decode. */
async function makeImageBuffer({ width, height, mime = JimpMime.jpeg, color = 0x336699ff }) {
  const image = new Jimp({ width, height, color });
  return image.getBuffer(mime);
}

describe('prepareImagesForExtraction — raster images', () => {
  test('a normal-sized image passes through unsliced, byte-for-byte', async () => {
    const buffer = await makeImageBuffer({ width: 800, height: 600 });
    const result = await prepareImagesForExtraction({ buffer, mimeType: 'image/jpeg' });

    expect(result.ok).toBe(true);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].mediaType).toBe('image/jpeg');
    expect(Buffer.from(result.images[0].data, 'base64')).toEqual(buffer);
  });

  test('a moderately tall but ordinary photo (aspect ratio < 2) is NOT sliced', async () => {
    // 1200 x 2000 -- taller than it is wide, like a portrait phone photo,
    // but nowhere near the report-screenshot shape this feature targets.
    const buffer = await makeImageBuffer({ width: 1200, height: 2000 });
    const result = await prepareImagesForExtraction({ buffer, mimeType: 'image/jpeg' });

    expect(result.ok).toBe(true);
    expect(result.images).toHaveLength(1);
  });

  test('a very tall screenshot (the Arboleaf PNG-export shape) gets sliced into <= 8 pieces', async () => {
    // Scaled down from the real 1080 x 10037 reference (§4) to keep the test
    // fast, but both thresholds that decide "very tall" are preserved: well
    // over TALL_HEIGHT_PX (1600), and a similar aspect ratio (~9.4:1 here vs.
    // ~9.29:1 real).
    const width = 180;
    const height = 1700;
    const buffer = await makeImageBuffer({ width, height });

    const result = await prepareImagesForExtraction({ buffer, mimeType: 'image/jpeg' });

    expect(result.ok).toBe(true);
    expect(result.images.length).toBeGreaterThan(1);
    expect(result.images.length).toBeLessThanOrEqual(MAX_IMAGES_PER_REQUEST);

    // Every slice must itself decode as a real image and be narrow enough
    // (no wider than the source) -- a sanity check that slicing didn't
    // corrupt the format, not just truncate bytes.
    let totalHeight = 0;
    for (const slice of result.images) {
      const sliceBuffer = Buffer.from(slice.data, 'base64');
      const decoded = await Jimp.read(sliceBuffer);
      expect(decoded.bitmap.width).toBe(width);
      totalHeight += decoded.bitmap.height;
    }
    // The slices stacked back up must cover the whole original image, with
    // no gap and no overlap.
    expect(totalHeight).toBe(height);
  });

  test('an image that cannot be decoded (garbage bytes declared as a supported type) fails cleanly, not silently', async () => {
    const result = await prepareImagesForExtraction({
      buffer: Buffer.from('not actually an image'),
      mimeType: 'image/png',
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('IMAGE_DECODE_FAILED');
  });
});

describe('prepareImagesForExtraction — PDF', () => {
  test('extracts a DCTDecode (JPEG) page-1 image verbatim', async () => {
    const jpegBytes = await makeImageBuffer({ width: 60, height: 90 });

    const pdfDoc = await PDFDocument.create();
    const embedded = await pdfDoc.embedJpg(jpegBytes);
    const page = pdfDoc.addPage([200, 300]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    const pdfBytes = await pdfDoc.save();

    const result = await prepareImagesForExtraction({ buffer: Buffer.from(pdfBytes), mimeType: 'application/pdf' });

    expect(result.ok).toBe(true);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].mediaType).toBe('image/jpeg');
    // Byte-for-byte round trip -- this is the whole claim §4/§10.4 make:
    // pull the embedded stream back out rather than re-render the page.
    expect(Buffer.from(result.images[0].data, 'base64')).toEqual(jpegBytes);
  });

  test('a PDF whose page-1 image is FlateDecode re-encodes to a readable JPEG', async () => {
    // This is what Arboleaf actually produces. Running the real vendor file
    // through this function is how we found out: its page-1 XObject is
    // `/FlateDecode` with an `/ICCBased` 3-component colour space at 8 bits,
    // 1714x2797 — NOT the DCTDecode shape the first implementation assumed,
    // and the synthetic DCTDecode fixture above passed the whole time.
    //
    // A FlateDecode stream is not an image file, it is a bare grid of colour
    // samples, so it has to be re-encoded rather than handed over. pdf-lib's
    // `embedPng` stores exactly this shape, which makes it a faithful stand-in
    // for the vendor file the repo does not track.
    const pngBytes = await makeImageBuffer({ width: 60, height: 90, mime: JimpMime.png });

    const pdfDoc = await PDFDocument.create();
    const embedded = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([200, 300]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
    const pdfBytes = await pdfDoc.save();

    const result = await prepareImagesForExtraction({ buffer: Buffer.from(pdfBytes), mimeType: 'application/pdf' });

    expect(result.ok).toBe(true);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].mediaType).toBe('image/jpeg');

    // Re-encoded, so no byte-for-byte claim is possible — assert instead that
    // what came out is a real, decodable image of the original dimensions.
    // A silently truncated or mis-strided buffer would still be valid base64.
    const decoded = await Jimp.read(Buffer.from(result.images[0].data, 'base64'));
    expect(decoded.bitmap.width).toBe(60);
    expect(decoded.bitmap.height).toBe(90);
  });

  test('a FlateDecode image with an unreadable colour layout still fails cleanly', async () => {
    // The re-encode path must not guess. A stream whose byte count is not a
    // whole number of 1- or 3-component pixels cannot be laid out, and
    // inventing a stride would hand the model a picture of noise to
    // hallucinate over — worse than a clear refusal.
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 300]);
    const bogus = pdfDoc.context.stream(zlib.deflateSync(Buffer.alloc(7 * 11 * 2)), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 7,
      Height: 11,
      BitsPerComponent: 8,
      ColorSpace: 'DeviceRGB',
      Filter: 'FlateDecode',
    });
    const ref = pdfDoc.context.register(bogus);
    page.node.setXObject(PDFName.of('Im0'), ref);
    const pdfBytes = await pdfDoc.save();

    const result = await prepareImagesForExtraction({ buffer: Buffer.from(pdfBytes), mimeType: 'application/pdf' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PDF_UNSUPPORTED_IMAGE_FORMAT');
  });

  test('a PDF page with no embedded image at all fails cleanly', async () => {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.addPage([200, 300]); // a blank page -- no XObject
    const pdfBytes = await pdfDoc.save();

    const result = await prepareImagesForExtraction({ buffer: Buffer.from(pdfBytes), mimeType: 'application/pdf' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PDF_NO_EMBEDDED_IMAGE');
  });

  test('an unparseable PDF fails cleanly rather than throwing', async () => {
    const result = await prepareImagesForExtraction({ buffer: Buffer.from('%PDF-1.4 not a real pdf'), mimeType: 'application/pdf' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PDF_PARSE_FAILED');
  });
});
