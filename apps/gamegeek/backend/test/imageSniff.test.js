import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffCoverImage, ALLOWED_COVER_MIME_TYPES } from '../src/lib/imageSniff.js';

describe('sniffCoverImage', () => {
  test('identifies a JPEG by its magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    assert.deepEqual(sniffCoverImage(buf), { mimeType: 'image/jpeg', ext: 'jpg' });
  });

  test('identifies a PNG by its magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    assert.deepEqual(sniffCoverImage(buf), { mimeType: 'image/png', ext: 'png' });
  });

  test('identifies a WebP by its RIFF/WEBP markers', () => {
    const buf = Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBP', 'latin1'),
    ]);
    assert.deepEqual(sniffCoverImage(buf), { mimeType: 'image/webp', ext: 'webp' });
  });

  test('rejects a file whose extension lies about its bytes', () => {
    // A PDF's real signature, "disguised" as an upload named cover.png.
    const buf = Buffer.from('%PDF-1.4\n...', 'latin1');
    assert.equal(sniffCoverImage(buf), null);
  });

  test('rejects garbage and empty buffers without throwing', () => {
    assert.equal(sniffCoverImage(Buffer.from([1, 2, 3])), null);
    assert.equal(sniffCoverImage(Buffer.alloc(0)), null);
    assert.equal(sniffCoverImage(null), null);
    assert.equal(sniffCoverImage('not a buffer'), null);
  });

  test('ALLOWED_COVER_MIME_TYPES is exactly the three formats the upload route accepts', () => {
    assert.deepEqual([...ALLOWED_COVER_MIME_TYPES].sort(), ['image/jpeg', 'image/png', 'image/webp']);
  });
});
