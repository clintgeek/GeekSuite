/**
 * Content-sniffing for uploaded photos and documents. The client's declared
 * MIME type and filename are never trusted — this reads the magic bytes at
 * the front of the buffer and decides from those alone. Same technique as
 * apps/gamegeek/backend/src/lib/imageSniff.js, widened to ThingGeek's set
 * (DOCS/THINGGEEK_PLAN.md "Files"): jpeg, png, webp, heic/heif, pdf, txt.
 */
import thingConstants from '@geeksuite/schemas/thinggeek/constants';

const { PHOTO_MIMES, DOCUMENT_MIMES } = thingConstants;

// ISO-BMFF major brands. HEVC-coded HEIC vs the generic HEIF container.
// AVIF shares the container ('avif'/'avis') and is deliberately NOT here.
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);
const HEIF_BRANDS = new Set(['mif1', 'msf1']);

function sniffIsoBmff(buf) {
  if (buf.length < 12 || buf.subarray(4, 8).toString('latin1') !== 'ftyp') return null;
  const boxSize = buf.readUInt32BE(0);
  const major = buf.subarray(8, 12).toString('latin1');
  if (HEIC_BRANDS.has(major)) return { mime: 'image/heic', ext: 'heic' };
  if (HEIF_BRANDS.has(major)) {
    // A generic `mif1` container is AVIF when its compatible brands say so.
    const end = Math.min(buf.length, Math.max(16, boxSize));
    const brands = [];
    for (let off = 16; off + 4 <= end; off += 4) brands.push(buf.subarray(off, off + 4).toString('latin1'));
    if (brands.some((b) => b === 'avif' || b === 'avis') && !brands.some((b) => HEIC_BRANDS.has(b))) return null;
    return { mime: 'image/heif', ext: 'heif' };
  }
  return null;
}

const BINARY_SIGNATURES = [
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    matches: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: 'png',
    matches: (buf) => buf.length >= 8
      && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    matches: (buf) => buf.length >= 12
      && buf.subarray(0, 4).toString('latin1') === 'RIFF'
      && buf.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    mime: 'application/pdf',
    ext: 'pdf',
    matches: (buf) => buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-',
  },
];

/** Plain text = valid UTF-8 with no NUL byte anywhere. */
function isPlainText(buf) {
  if (buf.includes(0x00)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Buffer} buffer
 * @returns {{ mime: string, ext: string } | null}
 */
export function sniffFile(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  for (const sig of BINARY_SIGNATURES) {
    if (sig.matches(buffer)) return { mime: sig.mime, ext: sig.ext };
  }
  const iso = sniffIsoBmff(buffer);
  if (iso) return iso;
  if (isPlainText(buffer)) return { mime: 'text/plain', ext: 'txt' };
  return null;
}

/** May a sniffed MIME be stored as this kind? The shared constants decide. */
export function isAllowedFor(kind, mime) {
  if (kind === 'photo') return PHOTO_MIMES.includes(mime);
  if (kind === 'document') return DOCUMENT_MIMES.includes(mime);
  return false;
}

export function isImageMime(mime) {
  return typeof mime === 'string' && mime.startsWith('image/');
}

export default { sniffFile, isAllowedFor, isImageMime };
