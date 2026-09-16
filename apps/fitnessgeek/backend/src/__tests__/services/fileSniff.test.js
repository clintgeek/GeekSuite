import { describe, test, expect } from '@jest/globals';
import { sniffContentType, ALLOWED_UPLOAD_MIME_TYPES, extensionForMimeType } from '../../services/fileSniff.js';

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
});
