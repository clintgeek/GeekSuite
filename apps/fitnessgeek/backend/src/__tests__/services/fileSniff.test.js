import { describe, test, expect } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import {
  sniffContentType,
  sniffXlsxContentType,
  sniffUploadContentType,
  ALLOWED_UPLOAD_MIME_TYPES,
  XLSX_MIME_TYPE,
  extensionForMimeType,
} from '../../services/fileSniff.js';

// Same cwd-relative convention as bodyCompXlsxParser.test.js.
const REAL_EXPORT_PATH = path.resolve(process.cwd(), '../../../DOCS/body_comp.xlsx');

describe('sniffContentType', () => {
  test('identifies a real PDF by magic bytes', () => {
    const buf = Buffer.from('%PDF-1.4\n%\xd3\xeb\xe9\xe1\n1 0 obj\n', 'latin1');
    expect(sniffContentType(buf)).toBe('application/pdf');
  });

  test('identifies a real JPEG by magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(sniffContentType(buf)).toBe('image/jpeg');
  });

  // The exact landmine this feature was built around: Arboleaf's Android
  // app shares a file named with a .png extension whose actual bytes are
  // JPEG (DOCS/screenshots/arboleaf.png). Extension/declared-mimetype-based
  // detection would get this wrong; the sniffer must not.
  test('a file named .png with JPEG bytes is identified as JPEG, not PNG', () => {
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    expect(sniffContentType(jpegBytes)).toBe('image/jpeg');
    expect(sniffContentType(jpegBytes)).not.toBe('image/png');
  });

  test('identifies a real PNG by magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(sniffContentType(buf)).toBe('image/png');
  });

  test('identifies GIF87a and GIF89a', () => {
    expect(sniffContentType(Buffer.from('GIF87a...', 'latin1'))).toBe('image/gif');
    expect(sniffContentType(Buffer.from('GIF89a...', 'latin1'))).toBe('image/gif');
  });

  test('identifies WEBP (RIFF....WEBP)', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'latin1'),
    ]);
    expect(sniffContentType(buf)).toBe('image/webp');
  });

  test('rejects a text file masquerading as anything else', () => {
    const buf = Buffer.from('just some plain text, not a real file format', 'utf8');
    expect(sniffContentType(buf)).toBeNull();
  });

  test('rejects an empty buffer', () => {
    expect(sniffContentType(Buffer.alloc(0))).toBeNull();
    expect(sniffContentType(null)).toBeNull();
  });

  test('ALLOWED_UPLOAD_MIME_TYPES lists exactly the sniffable types', () => {
    expect(ALLOWED_UPLOAD_MIME_TYPES).toEqual([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ]);
  });

  test('extensionForMimeType maps every allowed type and defaults unknown types to empty string', () => {
    expect(extensionForMimeType('application/pdf')).toBe('.pdf');
    expect(extensionForMimeType('image/jpeg')).toBe('.jpg');
    expect(extensionForMimeType('unknown/type')).toBe('');
  });

  // sniffContentType stays signature-only on purpose — a bare zip signature
  // can't distinguish a spreadsheet from any other archive. It must not be
  // fooled into claiming otherwise.
  test('sniffContentType never claims a zip-signature buffer is a known type', () => {
    const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(sniffContentType(zipBytes)).toBeNull();
  });
});

describe('sniffXlsxContentType — the async, zip-opening check', () => {
  test('identifies the REAL Arboleaf export as a spreadsheet', async () => {
    const buffer = await fs.readFile(REAL_EXPORT_PATH);
    expect(await sniffXlsxContentType(buffer)).toBe(XLSX_MIME_TYPE);
  });

  // The whole reason this can't be a signature check: an unrelated zip
  // shares the exact same four magic bytes as a real workbook, and honest
  // sniffing means opening it far enough to tell the difference rather than
  // accepting every zip as a spreadsheet (see fileSniff.js's header).
  test('rejects a zip that is not a spreadsheet, even though it shares the same magic bytes', async () => {
    const zip = new JSZip();
    zip.file('hello.txt', 'just a regular zip, not a workbook');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(await sniffXlsxContentType(buffer)).toBeNull();
  });

  test('rejects a buffer that merely starts with the zip signature but is not a real archive', async () => {
    const fakeZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff, 0xff, 0xff]);
    expect(await sniffXlsxContentType(fakeZip)).toBeNull();
  });

  test('rejects a non-zip buffer outright, without trying to open it', async () => {
    expect(await sniffXlsxContentType(Buffer.from('plain text'))).toBeNull();
    expect(await sniffXlsxContentType(Buffer.alloc(0))).toBeNull();
    expect(await sniffXlsxContentType(null)).toBeNull();
  });
});

describe('sniffUploadContentType — the combined check callers should use', () => {
  test('still identifies every signature-based type synchronously handles', async () => {
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    expect(await sniffUploadContentType(jpegBytes)).toBe('image/jpeg');
  });

  test('falls through to the xlsx check for a real spreadsheet export', async () => {
    const buffer = await fs.readFile(REAL_EXPORT_PATH);
    expect(await sniffUploadContentType(buffer)).toBe(XLSX_MIME_TYPE);
  });

  test('rejects a non-spreadsheet zip and any other unmatched content', async () => {
    const zip = new JSZip();
    zip.file('photo.jpg', Buffer.from([0xff, 0xd8, 0xff]));
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    expect(await sniffUploadContentType(buffer)).toBeNull();
    expect(await sniffUploadContentType(Buffer.from('plain text'))).toBeNull();
  });
});
