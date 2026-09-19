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
//
// XLSX IS NOT A SIGNATURE MATCH — IT'S A ZIP WITH A PROMISE
// ------------------------------------------------------------
// An `.xlsx` (the Arboleaf data-export path, see bodyCompXlsxParser.js) is a
// ZIP archive under the hood, and ALL zips share the same four magic bytes
// (`PK\x03\x04`) regardless of what's inside — a `.zip` of family photos
// sniffs identically to a spreadsheet at the byte-signature level. Treating
// "starts with the zip signature" as "is an xlsx" would accept literally any
// zip a user uploads, which is worse than not sniffing at all. So this file
// draws an honest line: `sniffContentType` below stays signature-only and
// never claims a zip is a spreadsheet. `sniffXlsxContentType` is the
// separate, necessarily asynchronous check that actually opens the archive
// and confirms it carries a spreadsheet content-type declaration in its own
// OPC manifest (`[Content_Types].xml`) before it is trusted — see that
// function's own comment. `sniffUploadContentType` is what callers should
// use going forward: it tries the cheap synchronous signatures first and
// only pays for opening the zip when the synchronous checks find nothing.

import JSZip from 'jszip';

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
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

/** File extension to store a sniffed MIME type under. Never derived from the client-supplied filename. */
export function extensionForMimeType(mimeType) {
  return EXTENSION_BY_MIME_TYPE[mimeType] || '';
}

/**
 * The real, canonical MIME type for an Arboleaf ".xlsx" data export — not
 * part of `ALLOWED_UPLOAD_MIME_TYPES` (that list is specifically "what
 * `sniffContentType` can identify by signature alone," and this type never
 * can be, see this file's header). Exported so a caller building an error
 * message or checking `upload.mimeType === XLSX_MIME_TYPE` doesn't need to
 * spell the string out itself.
 */
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The four bytes every ZIP-based format (including `.xlsx`) starts with. */
function looksLikeZip(buffer) {
  return buffer.length >= 4
    && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

/**
 * Confirm a zip-signature buffer is actually a spreadsheet, not just any
 * zip — see this file's header for why the signature alone can't tell them
 * apart.
 *
 * The check: open the archive and read its own Open Packaging Conventions
 * manifest, `[Content_Types].xml`, which every valid `.xlsx`/`.docx`/`.pptx`
 * carries and which declares each part's real content type. A workbook's
 * `/xl/workbook.xml` part is always declared with a content type containing
 * `spreadsheetml.sheet` — this is the format registering itself, not a file
 * extension or a guess. A `.zip` of unrelated files has no such manifest (or
 * has one that says something else entirely) and is correctly rejected.
 *
 * Deliberately does not fully parse the XML here (that's
 * `bodyCompXlsxParser.js`'s job on a file already accepted) — a substring
 * check against a Content_Types.xml that must be present and well-formed
 * enough to fail this quickly on a non-spreadsheet zip, without pulling the
 * XML parser into the upload path just to answer "is this the right kind of
 * file."
 *
 * @param {Buffer} buffer
 * @returns {Promise<string|null>} `XLSX_MIME_TYPE`, or `null` if this isn't
 *   a valid zip, isn't a spreadsheet, or errors while being opened (a
 *   corrupt/truncated upload is "not a valid file," not a 500).
 */
export async function sniffXlsxContentType(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || !looksLikeZip(buffer)) return null;
  try {
    const zip = await JSZip.loadAsync(buffer);
    const manifest = zip.file('[Content_Types].xml');
    if (!manifest) return null;
    const manifestXml = await manifest.async('string');
    return manifestXml.includes('spreadsheetml.sheet') ? XLSX_MIME_TYPE : null;
  } catch (error) {
    // A buffer that merely starts with the zip signature but isn't a real,
    // readable archive (truncated upload, unrelated bytes that happen to
    // start "PK\x03\x04") throws inside JSZip rather than sniffing as
    // anything — same "unsupported, not a server error" outcome as every
    // other unmatched buffer in this file.
    return null;
  }
}

/**
 * The combined sniff a caller should actually use: the cheap synchronous
 * signatures first (PDF/JPEG/PNG/GIF/WEBP), then — only if none of those
 * matched — the zip-opening xlsx check. Most uploads never pay for the
 * second half at all.
 *
 * @param {Buffer} buffer
 * @returns {Promise<string|null>}
 */
export async function sniffUploadContentType(buffer) {
  const bySignature = sniffContentType(buffer);
  if (bySignature) return bySignature;
  return sniffXlsxContentType(buffer);
}
