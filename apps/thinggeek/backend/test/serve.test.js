/**
 * GET /api/files/:fileId and /thumb — headers, household isolation,
 * confinement of a stored path read back from the database.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { buildHarness, auth, liveThing, newId, jpegWithGps, pdfBuffer, hasGpsTag } from './helpers/harness.js';
import sharp from 'sharp';

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

let h;
let photo;
let pdf;
let txt;
let jpeg;
before(async () => {
  const thing = liveThing();
  h = buildHarness({ things: [thing] });
  jpeg = await jpegWithGps();
  const up = async (buf, name, kind) => (await request(h.app).post(`/api/things/${thing._id}/files`).set(auth('chef'))
    .field('kind', kind).attach('file', buf, name)).body.file;
  photo = await up(jpeg, 'Wendy: bow!.jpg', 'photo');
  pdf = await up(pdfBuffer(), 'manual.pdf', 'document');
  txt = await up(Buffer.from('plain words\n'), 'notes.txt', 'document');
});
after(() => h.cleanup());

describe('serving', () => {
  test('the original: type, inline, safe filename, private immutable cache, nosniff; EXIF kept', async () => {
    const res = await request(h.app).get(`/api/files/${photo.id}`).set(auth('heather')).buffer(true).parse(binary);
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.equal(res.headers['content-disposition'], 'inline; filename="Wendy bow.jpg"');
    assert.equal(res.headers['cache-control'], 'private, max-age=31536000, immutable');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.body.equals(jpeg));
    assert.ok(hasGpsTag((await sharp(res.body).metadata()).exif), 'the original is the owner\'s own record');
  });

  test('the thumbnail: webp, inline, cached, no EXIF', async () => {
    const res = await request(h.app).get(`/api/files/${photo.id}/thumb`).set(auth('chef')).buffer(true).parse(binary);
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/webp');
    assert.match(res.headers['content-disposition'], /^inline; filename="Wendy bow-thumb\.webp"$/);
    assert.equal(res.headers['cache-control'], 'private, max-age=31536000, immutable');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal((await sharp(res.body).metadata()).exif, undefined);
  });

  test('a PDF is inline', async () => {
    const res = await request(h.app).get(`/api/files/${pdf.id}`).set(auth('chef'));
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.equal(res.headers['content-disposition'], 'inline; filename="manual.pdf"');
  });

  test('text is an attachment, never rendered inline', async () => {
    const res = await request(h.app).get(`/api/files/${txt.id}`).set(auth('chef'));
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^text\/plain/);
    assert.equal(res.headers['content-disposition'], 'attachment; filename="notes.txt"');
  });

  test('no thumbnail → 404', async () => {
    const res = await request(h.app).get(`/api/files/${pdf.id}/thumb`).set(auth('chef'));
    assert.equal(res.status, 404);
  });

  test('unknown or malformed id → 404', async () => {
    assert.equal((await request(h.app).get(`/api/files/${newId()}`).set(auth('chef'))).status, 404);
    assert.equal((await request(h.app).get('/api/files/zzz').set(auth('chef'))).status, 404);
  });

  test("another household's file → 404, even with a valid path on disk", async () => {
    const mine = h.ThingFile.docs.find((d) => String(d._id) === photo.id);
    const foreign = { ...structuredClone({ ...mine, _id: undefined }), _id: newId(), householdId: 'other' };
    h.ThingFile.docs.push(foreign);
    const res = await request(h.app).get(`/api/files/${foreign._id}`).set(auth('chef'));
    assert.equal(res.status, 404);
    const thumb = await request(h.app).get(`/api/files/${foreign._id}/thumb`).set(auth('chef'));
    assert.equal(thumb.status, 404);
  });

  test('a stored path that escapes FILES_PATH is never served', async () => {
    const outside = path.join(path.dirname(h.filesPath), `thinggeek-secret-${process.pid}.txt`);
    fs.writeFileSync(outside, 'secret');
    try {
      for (const bad of [`../${path.basename(outside)}`, outside, 'default/../../x', '']) {
        const rec = { _id: newId(), householdId: 'default', kind: 'document', mime: 'text/plain', size: 6, sha256: 'x', path: bad, thumbPath: bad };
        h.ThingFile.docs.push(rec);
        const res = await request(h.app).get(`/api/files/${rec._id}`).set(auth('chef'));
        assert.equal(res.status, 404, `path ${JSON.stringify(bad)}`);
        assert.ok(!res.text.includes('secret'));
        const t = await request(h.app).get(`/api/files/${rec._id}/thumb`).set(auth('chef'));
        assert.equal(t.status, 404);
      }
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  test('a record whose bytes are gone → 404, not 500', async () => {
    const rec = { _id: newId(), householdId: 'default', kind: 'photo', mime: 'image/png', size: 1, sha256: 'x', path: 'default/2020/01/missing.png', thumbPath: null };
    h.ThingFile.docs.push(rec);
    assert.equal((await request(h.app).get(`/api/files/${rec._id}`).set(auth('chef'))).status, 404);
  });
});
