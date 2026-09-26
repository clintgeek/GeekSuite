/**
 * fileSniff (magic bytes) and fileStorage (path confinement) units.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { sniffFile, isAllowedFor } from '../src/lib/fileSniff.js';
import { resolveInside, buildRelPaths, deleteFileQuiet, PathEscapeError } from '../src/lib/fileStorage.js';
import { pngBuffer, pdfBuffer, undecodableHeic, jpegWithGps, makeTempDir } from './helpers/harness.js';

const ftyp = (major, compat = []) => Buffer.concat([
  Buffer.from([0, 0, 0, 16 + 4 * compat.length]), Buffer.from('ftyp'), Buffer.from(major), Buffer.from([0, 0, 0, 0]),
  ...compat.map((c) => Buffer.from(c)),
]);

describe('sniffFile', () => {
  test('recognizes each accepted format by its bytes', async () => {
    assert.equal(sniffFile(await jpegWithGps()).mime, 'image/jpeg');
    assert.equal(sniffFile(await pngBuffer()).mime, 'image/png');
    assert.equal(sniffFile(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')).mime, 'image/webp');
    assert.equal(sniffFile(undecodableHeic()).mime, 'image/heic');
    assert.equal(sniffFile(ftyp('mif1', ['mif1', 'heic'])).mime, 'image/heif');
    assert.equal(sniffFile(pdfBuffer()).mime, 'application/pdf');
    assert.equal(sniffFile(Buffer.from('héllo')).mime, 'text/plain');
  });

  test('refuses AVIF, HTML-with-NUL, invalid UTF-8, empty', () => {
    assert.equal(sniffFile(ftyp('avif', ['mif1', 'avif'])), null);
    assert.equal(sniffFile(ftyp('mif1', ['mif1', 'avif'])), null);
    assert.equal(sniffFile(Buffer.from([0x3c, 0x68, 0x00])), null);
    assert.equal(sniffFile(Buffer.from([0xc3, 0x28])), null);
    assert.equal(sniffFile(Buffer.alloc(0)), null);
  });

  test('HTML sniffs as text, which is never a photo', () => {
    const s = sniffFile(Buffer.from('<html></html>'));
    assert.equal(s.mime, 'text/plain');
    assert.equal(isAllowedFor('photo', s.mime), false);
    assert.equal(isAllowedFor('document', 'image/heic'), false);
    assert.equal(isAllowedFor('photo', 'image/heic'), true);
  });
});

describe('path confinement', () => {
  const root = path.resolve('/data/files');
  test('inside paths resolve', () => {
    assert.equal(resolveInside(root, 'default/2026/09/a.jpg'), path.join(root, 'default/2026/09/a.jpg'));
  });
  test('escapes throw', () => {
    for (const bad of ['../x', 'default/../../x', '/etc/passwd', '', '.', 'a\0b', null, 5]) {
      assert.throws(() => resolveInside(root, bad), PathEscapeError, String(bad));
    }
    assert.throws(() => resolveInside(root, '../files-evil/x'), PathEscapeError, 'sibling prefix');
  });
  test('buildRelPaths refuses a bad household, sha or extension', () => {
    const sha = 'a'.repeat(64);
    assert.deepEqual(buildRelPaths({ householdId: 'default', sha256: sha, ext: 'jpg', date: new Date('2026-03-05T00:00:00Z') }), {
      path: `default/2026/03/${sha}.jpg`, thumbPath: `default/2026/03/${sha}.thumb.webp`,
    });
    assert.throws(() => buildRelPaths({ householdId: '../x', sha256: sha, ext: 'jpg' }), PathEscapeError);
    assert.throws(() => buildRelPaths({ householdId: 'default', sha256: '../x', ext: 'jpg' }), PathEscapeError);
    assert.throws(() => buildRelPaths({ householdId: 'default', sha256: sha, ext: 'html' }), PathEscapeError);
    assert.throws(() => buildRelPaths({ householdId: 'default', sha256: sha, ext: 'constructor' }), PathEscapeError);
  });
  test('deleteFileQuiet will not touch an escaping path', async () => {
    const dir = makeTempDir();
    assert.equal(await deleteFileQuiet(dir, '../../etc/hostname'), false);
  });
});
