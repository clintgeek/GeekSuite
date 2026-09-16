// Content-sniffing for uploaded body-composition scan files.
//
// Never trust a declared MIME type or a file extension — both are supplied
// by the client and are free to lie. The sample file this feature was built
// against (`DOCS/screenshots/arboleaf.png`) is a working example of exactly
// that: its extension says PNG, but its actual bytes are a JPEG. Every check
// here reads the magic bytes at the front of the buffer instead.
//
// The allowlist is deliberately small — only formats we can positively
// identify by signature. Web Share Target's manifest entry advertises
// `application/pdf` and `image/*`, which is broader than what we accept;
// anything outside this list (HEIC, TIFF, BMP, SVG, ...) is rejected with a
// clear error rather than guessed at.

const SIGNATURES = [
  {
    mimeType: 'application/pdf',
    matches: (buf) => buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF',
  },
  {
    mimeType: 'image/jpeg',
    matches: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    matches: (buf) => buf.length >= 8
      && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mimeType: 'image/gif',
    matches: (buf) => buf.length >= 6
      && ['GIF87a', 'GIF89a'].includes(buf.subarray(0, 6).toString('latin1')),
  },
  {
    mimeType: 'image/webp',
    matches: (buf) => buf.length >= 12
      && buf.subarray(0, 4).toString('latin1') === 'RIFF'
      && buf.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** Every MIME type this sniffer can positively identify. */
export const ALLOWED_UPLOAD_MIME_TYPES = SIGNATURES.map((sig) => sig.mimeType);

/**
 * Inspect a buffer's magic bytes and return the MIME type it actually is,
 * or null if it does not match any allowed signature.
 *
 * @param {Buffer} buffer
 * @returns {string|null}
 */
export function sniffContentType(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  for (const sig of SIGNATURES) {
    if (sig.matches(buffer)) return sig.mimeType;
  }
  return null;
}

const EXTENSION_BY_MIME_TYPE = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/** File extension to store a sniffed MIME type under. Never derived from the client-supplied filename. */
export function extensionForMimeType(mimeType) {
  return EXTENSION_BY_MIME_TYPE[mimeType] || '';
}
