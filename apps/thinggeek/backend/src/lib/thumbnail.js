/**
 * Thumbnails with sharp: 480 px on the long edge, webp, EXIF-rotated, and
 * with ALL metadata stripped. The thumbnail is what gets shown in lists, so
 * it must never carry the photo's EXIF — GPS coordinates of the house where
 * the firearm is kept being the obvious case. sharp drops metadata unless
 * `.withMetadata()`/`.keepExif()` is called; neither is, on purpose.
 *
 * The ORIGINAL is stored untouched (it is the owner's own record, served only
 * to household members).
 *
 * HEIC: sharp's prebuilt libvips ships libheif without an HEVC decoder, so
 * most iPhone photos cannot be decoded here. That is not an upload failure —
 * `makeThumbnail` resolves `null` and the UI shows a generic tile.
 */
import sharp from 'sharp';

export const THUMB_EDGE = 480;

// Refuse decompression bombs well before libvips' own 268 MP default.
const LIMIT_INPUT_PIXELS = 100_000_000;

/**
 * @param {Buffer} buffer the original image
 * @returns {Promise<{ thumb: Buffer, width: number|null, height: number|null } | null>}
 *   width/height are the ORIGINAL's display dimensions (after EXIF
 *   orientation), or null when sharp cannot decode the image at all.
 */
export async function makeThumbnail(buffer) {
  try {
    const meta = await sharp(buffer, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();
    const quarterTurn = meta.orientation >= 5 && meta.orientation <= 8;
    const width = (quarterTurn ? meta.height : meta.width) ?? null;
    const height = (quarterTurn ? meta.width : meta.height) ?? null;
    const thumb = await sharp(buffer, { limitInputPixels: LIMIT_INPUT_PIXELS })
      .rotate() // apply EXIF orientation, then the orientation tag is gone with the rest
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return { thumb, width, height };
  } catch {
    return null;
  }
}

export default { makeThumbnail, THUMB_EDGE };
