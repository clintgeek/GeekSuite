/**
 * POST /api/things/:id/files — DOCS/THINGGEEK_PLAN.md "Files".
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import thingConstants from '@geeksuite/schemas/thinggeek/constants';
import {
  buildHarness, auth, liveThing, newId, jpegWithGps, pngBuffer, pdfBuffer, undecodableHeic, hasGpsTag,
} from './helpers/harness.js';

const { bounds } = thingConstants;

let h;
let thing;
beforeEach(() => {
  thing = liveThing();
  h = buildHarness({ things: [thing] });
});
afterEach(() => h.cleanup());

const upload = (id, buf, name, fields) => {
  let req = request(h.app).post(`/api/things/${id}/files`).set(auth('chef'));
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req.attach('file', buf, name);
};
const stored = () => h.Thing.docs.find((d) => String(d._id) === String(thing._id));
const abs = (rel) => path.join(h.filesPath, rel);

describe('happy paths', () => {
  test('a JPEG photo with GPS EXIF: original kept as-is, thumbnail rotated, 480px, webp, NO metadata', async () => {
    const jpeg = await jpegWithGps();
    assert.ok(hasGpsTag((await sharp(jpeg).metadata()).exif), 'fixture must carry GPS');

    const res = await upload(thing._id, jpeg, 'boat.jpg', { kind: 'photo', role: 'id-plate', caption: 'hull plate' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.file.kind, 'photo');
    assert.equal(res.body.file.mime, 'image/jpeg');
    assert.equal(res.body.file.size, jpeg.length);
    // Display dimensions (orientation 6 swaps them).
    assert.equal(res.body.file.width, 500);
    assert.equal(res.body.file.height, 1000);
    assert.equal(res.body.entry.role, 'id-plate');
    assert.equal(res.body.entry.caption, 'hull plate');
    assert.equal(res.body.entry.fileId, res.body.file.id);

    const rec = h.ThingFile.docs[0];
    const sha = crypto.createHash('sha256').update(jpeg).digest('hex');
    assert.equal(rec.sha256, sha);
    assert.equal(rec.householdId, 'default');
    assert.equal(rec.uploadedBy, '6818c2bddcf626909f6a93a1');
    assert.match(rec.path, new RegExp(`^default/\\d{4}/\\d{2}/${sha}\\.jpg$`));
    assert.ok(fs.readFileSync(abs(rec.path)).equals(jpeg), 'original stored byte-for-byte');

    const thumb = fs.readFileSync(abs(rec.thumbPath));
    const tm = await sharp(thumb).metadata();
    assert.equal(tm.format, 'webp');
    assert.equal(Math.max(tm.width, tm.height), 480);
    assert.equal(tm.width, 240); // rotated: portrait
    assert.equal(tm.height, 480);
    assert.equal(tm.exif, undefined, 'thumbnail must carry no EXIF');
    assert.equal(tm.orientation, undefined);
    assert.ok(!thumb.includes(Buffer.from('Exif')), 'no EXIF chunk anywhere in the thumbnail');

    const t = stored();
    assert.equal(t.photos.length, 1);
    assert.equal(String(t.photos[0].fileId), res.body.file.id);
    assert.equal(String(t.photos[0]._id), res.body.entry.id);
  });

  test('a PNG photo, default role overview', async () => {
    const png = await pngBuffer(64, 32);
    const res = await upload(thing._id, png, 'x.png', { kind: 'photo' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.file.mime, 'image/png');
    assert.equal(res.body.file.width, 64);
    assert.equal(res.body.entry.role, 'overview');
    const rec = h.ThingFile.docs[0];
    assert.match(rec.path, /\.png$/);
    const tm = await sharp(fs.readFileSync(abs(rec.thumbPath))).metadata();
    assert.equal(tm.width, 64, 'never enlarged');
  });

  test('a PDF document: no thumbnail, title defaults to the file name', async () => {
    const res = await upload(thing._id, pdfBuffer(), 'receipt.pdf', { kind: 'document', role: 'receipt' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.file.mime, 'application/pdf');
    assert.equal(res.body.file.width, null);
    assert.equal(res.body.entry.title, 'receipt.pdf');
    assert.equal(res.body.entry.role, 'receipt');
    assert.equal(h.ThingFile.docs[0].thumbPath, null);
    assert.equal(stored().documents.length, 1);
    assert.equal(stored().photos.length, 0);
  });

  test('an image document (a photographed receipt) gets a thumbnail', async () => {
    const res = await upload(thing._id, await pngBuffer(), 'r.png', { kind: 'document', role: 'receipt', title: 'Receipt' });
    assert.equal(res.status, 201);
    assert.ok(h.ThingFile.docs[0].thumbPath);
    assert.equal(res.body.entry.title, 'Receipt');
  });

  test('a UTF-8 text document is accepted', async () => {
    const res = await upload(thing._id, Buffer.from('Serial is on the stern — ok\n'), 'notes.txt', { kind: 'document' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.file.mime, 'text/plain');
  });

  test('HEIC that sharp cannot decode is stored with a null thumbnail, never refused', async () => {
    const heic = undecodableHeic();
    const res = await upload(thing._id, heic, 'IMG_0001.HEIC', { kind: 'photo' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.file.mime, 'image/heic');
    assert.equal(res.body.file.width, null);
    const rec = h.ThingFile.docs[0];
    assert.equal(rec.thumbPath, null);
    assert.match(rec.path, /\.heic$/);
    assert.ok(fs.existsSync(abs(rec.path)));
    assert.equal(stored().photos.length, 1);
  });
});

describe('type by magic bytes, never the client', () => {
  test('a .jpg (image/jpeg) that is really HTML → 415, nothing stored', async () => {
    const res = await request(h.app).post(`/api/things/${thing._id}/files`).set(auth('chef'))
      .field('kind', 'photo')
      .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'cat.jpg', contentType: 'image/jpeg' });
    assert.equal(res.status, 415);
    assert.equal(res.body.code, 'UNSUPPORTED_TYPE');
    assert.equal(h.ThingFile.docs.length, 0);
    assert.equal(stored().photos.length, 0);
  });

  test('text as a photo → 415 (text is a document type only)', async () => {
    const res = await upload(thing._id, Buffer.from('hello'), 'x.jpg', { kind: 'photo' });
    assert.equal(res.status, 415);
  });

  test('a PDF as a photo → 415', async () => {
    const res = await upload(thing._id, pdfBuffer(), 'x.jpg', { kind: 'photo' });
    assert.equal(res.status, 415);
  });

  test('binary junk with a NUL as a document → 415', async () => {
    const res = await upload(thing._id, Buffer.from([0x4d, 0x5a, 0x00, 0x90, 0x00]), 'x.txt', { kind: 'document' });
    assert.equal(res.status, 415);
  });

  test('invalid UTF-8 as a text document → 415', async () => {
    const res = await upload(thing._id, Buffer.from([0x68, 0xc3, 0x28, 0x69]), 'x.txt', { kind: 'document' });
    assert.equal(res.status, 415);
  });
});

describe('rules', () => {
  test('over 25 MB → 413 FILE_TOO_LARGE', async () => {
    const big = Buffer.alloc(bounds.fileBytes.max + 1, 0x41);
    const res = await upload(thing._id, big, 'big.txt', { kind: 'document' });
    assert.equal(res.status, 413);
    assert.equal(res.body.code, 'FILE_TOO_LARGE');
    assert.equal(h.ThingFile.docs.length, 0);
  });

  test('a trashed thing → 404', async () => {
    stored().deletedAt = new Date();
    const res = await upload(thing._id, await pngBuffer(), 'x.png', { kind: 'photo' });
    assert.equal(res.status, 404);
    assert.equal(h.ThingFile.docs.length, 0);
  });

  test("another household's thing → 404", async () => {
    const foreign = liveThing({ householdId: 'other' });
    h.Thing.docs.push(foreign);
    const res = await upload(foreign._id, await pngBuffer(), 'x.png', { kind: 'photo' });
    assert.equal(res.status, 404);
    assert.equal(h.ThingFile.docs.length, 0);
  });

  test('a malformed or unknown id → 404', async () => {
    assert.equal((await upload('not-an-id', await pngBuffer(), 'x.png', { kind: 'photo' })).status, 404);
    assert.equal((await upload(newId(), await pngBuffer(), 'x.png', { kind: 'photo' })).status, 404);
  });

  test('bad kind or role → 400', async () => {
    assert.equal((await upload(thing._id, await pngBuffer(), 'x.png', { kind: 'video' })).status, 400);
    assert.equal((await upload(thing._id, await pngBuffer(), 'x.png', { kind: 'photo', role: 'receipt-ish' })).status, 400);
    assert.equal((await upload(thing._id, pdfBuffer(), 'x.pdf', { kind: 'document', role: 'id-plate' })).status, 400);
  });

  test('no file → 400', async () => {
    const res = await request(h.app).post(`/api/things/${thing._id}/files`).set(auth('chef')).field('kind', 'photo');
    assert.equal(res.status, 400);
  });

  test('photos at the cap → 409 LIMIT_REACHED, the array is not grown', async () => {
    stored().photos = Array.from({ length: bounds.photosMax.max }, () => ({ _id: newId(), fileId: newId(), role: 'other', caption: '' }));
    const res = await upload(thing._id, await pngBuffer(), 'x.png', { kind: 'photo' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'LIMIT_REACHED');
    assert.equal(stored().photos.length, bounds.photosMax.max);
  });

  test('one below the cap still fits', async () => {
    stored().documents = Array.from({ length: bounds.documentsMax.max - 1 }, () => ({ _id: newId(), fileId: newId(), role: 'other', title: '' }));
    const res = await upload(thing._id, pdfBuffer(), 'x.pdf', { kind: 'document' });
    assert.equal(res.status, 201);
    assert.equal(stored().documents.length, bounds.documentsMax.max);
  });

  test('the same bytes twice reuse one record (sha256 dedupe), two entries', async () => {
    const png = await pngBuffer();
    const a = await upload(thing._id, png, 'a.png', { kind: 'photo' });
    const b = await upload(thing._id, png, 'b.png', { kind: 'photo', role: 'detail' });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(b.body.deduped, true);
    assert.equal(a.body.file.id, b.body.file.id);
    assert.equal(h.ThingFile.docs.length, 1);
    assert.equal(stored().photos.length, 2);
    assert.notEqual(a.body.entry.id, b.body.entry.id);
  });

  test('dedupe touches the reused record (so the purge cannot race it)', async () => {
    const png = await pngBuffer();
    await upload(thing._id, png, 'a.png', { kind: 'photo' });
    const old = new Date('2020-01-01T00:00:00Z');
    h.ThingFile.docs[0].updatedAt = old;
    await upload(thing._id, png, 'a.png', { kind: 'photo' });
    assert.ok(h.ThingFile.docs[0].updatedAt > old);
  });

  test('dedupe is per household: another household\'s identical bytes are not reused', async () => {
    const png = await pngBuffer();
    const sha = crypto.createHash('sha256').update(png).digest('hex');
    h.ThingFile.docs.push({ _id: newId(), householdId: 'other', kind: 'photo', mime: 'image/png', size: png.length, sha256: sha, path: `other/2026/01/${sha}.png`, thumbPath: null, updatedAt: new Date(), createdAt: new Date() });
    const res = await upload(thing._id, png, 'a.png', { kind: 'photo' });
    assert.equal(res.status, 201);
    assert.equal(res.body.deduped, false);
    assert.equal(h.ThingFile.docs.length, 2);
  });

  test('the client filename never becomes a path', async () => {
    const res = await upload(thing._id, await pngBuffer(), '../../../../etc/passwd.png', { kind: 'photo' });
    assert.equal(res.status, 201);
    const rec = h.ThingFile.docs[0];
    assert.equal(rec.originalName, 'passwd.png');
    assert.match(rec.path, /^default\/\d{4}\/\d{2}\/[0-9a-f]{64}\.png$/);
  });
});
