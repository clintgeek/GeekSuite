/**
 * Content-sniffing for uploaded cover images. Never trust a declared MIME
 * type or a file extension — both are supplied by the client. Every check
 * here reads the magic bytes at the front of the buffer instead.
 *
 * Small, deliberately: only the three formats the upload route accepts
 * (jpeg/png/webp). Same technique as
 * apps/fitnessgeek/backend/src/services/fileSniff.js.
 */

const SIGNATURES = [
  {
    mimeType: 'image/jpeg',
    ext: 'jpg',
    matches: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    ext: 'png',
    matches: (buf) => buf.length >= 8
      && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mimeType: 'image/webp',
    ext: 'webp',
    matches: (buf) => buf.length >= 12
      && buf.subarray(0, 4).toString('latin1') === 'RIFF'
      && buf.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

export const ALLOWED_COVER_MIME_TYPES = SIGNATURES.map((sig) => sig.mimeType);

/**
 * @param {Buffer} buffer
 * @returns {{ mimeType: string, ext: string } | null}
 */
export function sniffCoverImage(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  for (const sig of SIGNATURES) {
    if (sig.matches(buffer)) return { mimeType: sig.mimeType, ext: sig.ext };
  }
  return null;
}

export default { ALLOWED_COVER_MIME_TYPES, sniffCoverImage };
