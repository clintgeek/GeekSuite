/**
 * The Attic's sealed bytes and identifiers (DOCS/THINGGEEK_PLAN.md "The
 * Attic"): encryption at rest, the guards (no-store → member → key → vault),
 * audit, household isolation, tamper and wrong-place failures, rotation,
 * and the purge. A TEST key is generated per run (helpers/harness.js).
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import mongoose from 'mongoose';
import atticModule from '@geeksuite/schemas/thinggeek/attic';
import vaultSessionModule from '@geeksuite/schemas/thinggeek/vaultSession';
import { buildHarness, auth, newId, jpegWithGps, pdfBuffer, hasGpsTag, testKeyring } from './helpers/harness.js';
import { loadVaultKeyring, SEALED_FILE_MAGIC } from '../src/lib/atticCrypto.js';
import { runPurge } from '../src/jobs/purge.js';

const { atticStarterTypeDoc, ATTIC_STARTER_TYPES, VAULT_IDLE_MS, VAULT_MAX_MS } = atticModule;
const { VAULT_COOKIE } = vaultSessionModule;

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

const PASSPORT_NUMBER = 'X12345678';

function world() {
  const passportType = { _id: newId(), ...atticStarterTypeDoc(ATTIC_STARTER_TYPES.find((t) => t.key === 'passport'), 'default') };
  const ssnType = { _id: newId(), ...atticStarterTypeDoc(ATTIC_STARTER_TYPES.find((t) => t.key === 'social-security'), 'default') };
  const doc = { _id: newId(), householdId: 'default', typeId: passportType._id, personIds: [], title: 'Passport', fields: { country: 'USA' }, secrets: {}, files: [], links: [], deletedAt: null };
  const other = { _id: newId(), householdId: 'default', typeId: passportType._id, personIds: [], title: 'Passport 2', fields: {}, secrets: {}, files: [], links: [], deletedAt: null };
  const theirs = { _id: newId(), householdId: 'other-household', typeId: passportType._id, personIds: [], title: 'Theirs', fields: {}, secrets: {}, files: [], links: [], deletedAt: null };
  return { passportType, ssnType, doc, other, theirs };
}

let h;
let w;
let chef;
beforeEach(() => {
  w = world();
  h = buildHarness({ attic: { AtticDocumentType: [w.passportType, w.ssnType], AtticDocument: [w.doc, w.other, w.theirs] } });
  chef = h.unlock('chef');
});
afterEach(() => h.cleanup());

const up = (cookie, docId, buf, name = 'card.jpg', side = 'front', who = 'chef') =>
  request(h.app).post(`/api/attic/documents/${docId}/files`).set(auth(who)).set('Cookie', cookie).field('side', side).attach('file', buf, name);

describe('the guards', () => {
  test('no key → every Attic route is 503 ATTIC_UNAVAILABLE (never plaintext), and the rest of ThingGeek still works', async () => {
    for (const env of [{}, { THINGGEEK_VAULT_KEY: 'too-short' }, { THINGGEEK_VAULT_KEY: Buffer.alloc(16).toString('base64') }]) {
      const keyring = loadVaultKeyring(env);
      assert.equal(keyring.ok, false);
      assert.doesNotMatch(String(keyring.reason), /too-short|AAAA/, 'the reason never echoes key material');
      const bare = buildHarness({ keyring, attic: { AtticDocument: [w.doc] } });
      const cookie = bare.unlock('chef');
      const res = await request(bare.app).get(`/api/attic/documents/${w.doc._id}/identifiers/number`).set(auth('chef')).set('Cookie', cookie);
      assert.equal(res.status, 503);
      assert.equal(res.body.code, 'ATTIC_UNAVAILABLE');
      assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
      const upload = await request(bare.app).post(`/api/attic/documents/${w.doc._id}/files`).set(auth('chef')).set('Cookie', cookie).attach('file', pdfBuffer(), 'x.pdf');
      assert.equal(upload.status, 503);
      assert.equal(walk(bare.filesPath).length, 0, 'nothing written without a key');
      assert.equal((await request(bare.app).get('/api/health')).status, 200);
      bare.cleanup();
    }
  });

  test('anonymous 401, a kid 403 NOT_A_MEMBER (even holding a vault cookie), a locked member 423 — all no-store', async () => {
    const url = `/api/attic/documents/${w.doc._id}/identifiers/number`;
    const anon = await request(h.app).get(url).set('Cookie', chef);
    assert.equal(anon.status, 401);
    const kid = await request(h.app).get(url).set(auth('kid')).set('Cookie', chef);
    assert.equal(kid.status, 403);
    assert.equal(kid.body.code, 'NOT_A_MEMBER');
    const locked = await request(h.app).get(url).set(auth('heather'));
    assert.equal(locked.status, 423);
    assert.equal(locked.body.code, 'VAULT_LOCKED');
    for (const r of [anon, kid, locked]) assert.equal(r.headers['cache-control'], 'no-store, max-age=0');
    const unknown = await request(h.app).get('/api/attic/nope').set(auth('chef'));
    assert.equal(unknown.headers['cache-control'], 'no-store, max-age=0');
  });

  test("another member's session cookie is refused", async () => {
    const res = await request(h.app).get(`/api/attic/documents/${w.doc._id}/identifiers/number`).set(auth('heather')).set('Cookie', chef);
    assert.equal(res.status, 423);
  });

  test('an idle session and an over-age session are refused; activity pushes the idle deadline', async () => {
    const url = `/api/attic/documents/${w.doc._id}/identifiers/number`;
    const idle = h.unlock('heather', { at: new Date(Date.now() - VAULT_IDLE_MS - 1000) });
    assert.equal((await request(h.app).get(url).set(auth('heather')).set('Cookie', idle)).status, 423);
    const old = h.unlock('heather', { at: new Date(Date.now() - VAULT_MAX_MS - 1000) });
    h.attic.VaultSession.docs.at(-1).lastSeenAt = new Date();
    assert.equal((await request(h.app).get(url).set(auth('heather')).set('Cookie', old)).status, 423);
    const fresh = h.unlock('heather', { at: new Date(Date.now() - VAULT_IDLE_MS + 30000) });
    assert.equal((await request(h.app).get(url).set(auth('heather')).set('Cookie', fresh)).status, 200);
    assert.ok(h.attic.VaultSession.docs.at(-1).lastSeenAt.getTime() > Date.now() - 5000, 'touched');
  });

  test('a malformed cookie is locked', async () => {
    const res = await request(h.app).get(`/api/attic/documents/${w.doc._id}/identifiers/number`).set(auth('chef')).set('Cookie', `${VAULT_COOKIE}=../../etc`);
    assert.equal(res.status, 423);
  });
});

describe('files: sealed at rest', () => {
  test('plaintext never touches the disk; the record holds no digest and no filename', async () => {
    const jpeg = await jpegWithGps();
    const pdf = pdfBuffer();
    assert.equal((await up(chef, w.doc._id, jpeg, 'passport-front.jpg', 'front')).status, 201);
    assert.equal((await up(chef, w.doc._id, pdf, 'scan.pdf', 'page')).status, 201);
    const onDisk = walk(h.filesPath);
    assert.equal(onDisk.length, 2);
    for (const f of onDisk) {
      const bytes = fs.readFileSync(f);
      assert.ok(bytes.subarray(0, 4).equals(SEALED_FILE_MAGIC), 'sealed header');
      assert.ok(!bytes.includes(Buffer.from('%PDF')), 'no PDF plaintext');
      assert.ok(!bytes.includes(Buffer.from([0xff, 0xd8, 0xff])), 'no JPEG plaintext');
      assert.match(f, /\/default\/attic\/\d{4}\/\d{2}\/[0-9a-f]{24}\.enc$/);
    }
    for (const r of h.attic.AtticFile.docs) {
      assert.equal(r.sha256, undefined);
      assert.ok(!('originalName' in r) || r.originalName === '', 'no filename stored');
      assert.equal(r.keyVersion, 1);
    }
    assert.equal(h.ThingFile.docs.length, 0, 'never in the things file collection');
  });

  test('served decrypted, no-store, inline or as a download, audit-logged; EXIF GPS is gone', async () => {
    const jpeg = await jpegWithGps();
    const { body } = await up(chef, w.doc._id, jpeg);
    const url = `/api/attic/files/${body.file.id}`;
    const res = await request(h.app).get(url).set(auth('chef')).set('Cookie', chef).buffer(true).parse(binary);
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
    assert.equal(res.headers['content-disposition'], 'inline; filename="thinggeek-attic.jpg"');
    const meta = await sharp(res.body).metadata();
    assert.equal(hasGpsTag(meta.exif), false, 'GPS stripped before sealing');
    assert.equal(meta.width, 500, 'orientation baked in');
    const dl = await request(h.app).get(`${url}?download=1`).set(auth('chef')).set('Cookie', chef);
    assert.equal(dl.headers['content-disposition'], 'attachment; filename="thinggeek-attic.jpg"');
    const actions = h.attic.AtticAudit.docs.map((a) => a.action);
    assert.deepEqual(actions, ['upload', 'file-view', 'download']);
    for (const a of h.attic.AtticAudit.docs) assert.equal(a.userId, '6818c2bddcf626909f6a93a1');
  });

  test('locked, another household, a deleted document → refused / 404', async () => {
    const { body } = await up(chef, w.doc._id, pdfBuffer(), 'x.pdf', 'page');
    const url = `/api/attic/files/${body.file.id}`;
    assert.equal((await request(h.app).get(url).set(auth('heather'))).status, 423);
    assert.equal((await up(chef, w.theirs._id, pdfBuffer())).status, 404, 'cannot upload onto another household');
    h.attic.AtticDocument.docs.find((d) => String(d._id) === String(w.doc._id)).deletedAt = new Date();
    assert.equal((await request(h.app).get(url).set(auth('chef')).set('Cookie', chef)).status, 404);
  });

  test('only photos and PDFs; a file is its own sealed object (no dedupe, no equality leak)', async () => {
    assert.equal((await up(chef, w.doc._id, Buffer.from('plain words\n'), 'n.txt')).status, 415);
    const pdf = pdfBuffer();
    await up(chef, w.doc._id, pdf, 'a.pdf', 'page');
    await up(chef, w.other._id, pdf, 'a.pdf', 'page');
    const blobs = walk(h.filesPath).map((f) => fs.readFileSync(f));
    assert.equal(blobs.length, 2);
    assert.ok(!blobs[0].equals(blobs[1]), 'same plaintext, different ciphertext');
  });

  test('tampered bytes, or bytes moved under another record, fail closed', async () => {
    const a = (await up(chef, w.doc._id, pdfBuffer(), 'a.pdf', 'page')).body.file.id;
    const b = (await up(chef, w.doc._id, await jpegWithGps(), 'b.jpg', 'front')).body.file.id;
    const recA = h.attic.AtticFile.docs.find((r) => String(r._id) === a);
    const recB = h.attic.AtticFile.docs.find((r) => String(r._id) === b);
    // B's record now points at A's bytes: the AAD names the file, so it won't open.
    const savedPath = recB.path;
    recB.path = recA.path;
    const moved = await request(h.app).get(`/api/attic/files/${b}`).set(auth('chef')).set('Cookie', chef);
    assert.equal(moved.status, 500);
    assert.equal(moved.body.code, 'ATTIC_UNREADABLE');
    recB.path = savedPath;
    const abs = path.join(h.filesPath, recA.path);
    const bytes = fs.readFileSync(abs);
    bytes[bytes.length - 1] ^= 0xff;
    fs.writeFileSync(abs, bytes);
    const tampered = await request(h.app).get(`/api/attic/files/${a}`).set(auth('chef')).set('Cookie', chef);
    assert.equal(tampered.status, 500);
    assert.ok(!JSON.stringify(tampered.body).includes('PDF'));
  });

  test('a different key cannot open them', async () => {
    const { body } = await up(chef, w.doc._id, pdfBuffer(), 'a.pdf', 'page');
    const rec = h.attic.AtticFile.docs[0];
    const sealed = fs.readFileSync(path.join(h.filesPath, rec.path));
    assert.throws(() => testKeyring().openFile({ householdId: 'default', fileId: body.file.id, sealed }), /could not open/);
    assert.ok(h.keyring.openFile({ householdId: 'default', fileId: body.file.id, sealed }).subarray(0, 4).equals(Buffer.from('%PDF')));
  });
});

describe('identifiers: sealed fields', () => {
  const put = (cookie, docId, values, who = 'chef') => request(h.app).put(`/api/attic/documents/${docId}/identifiers`).set(auth(who)).set('Cookie', cookie).send({ values });
  const reveal = (cookie, docId, key, who = 'chef') => request(h.app).get(`/api/attic/documents/${docId}/identifiers/${key}`).set(auth(who)).set('Cookie', cookie);

  test('sealed with a fresh IV and a tag; the plaintext is nowhere in the database or the audit log', async () => {
    const res = await put(chef, w.doc._id, { number: PASSPORT_NUMBER });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.identifiers, [{ key: 'number', hasValue: true }]);
    assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
    const sealed = h.attic.AtticDocument.docs.find((d) => String(d._id) === String(w.doc._id)).secrets.number;
    assert.equal(sealed.v, 1);
    assert.equal(Buffer.from(sealed.iv, 'base64').length, 12);
    assert.equal(Buffer.from(sealed.tag, 'base64').length, 16);
    const everything = JSON.stringify([h.attic.AtticDocument.docs, h.attic.AtticAudit.docs]);
    assert.ok(!everything.includes(PASSPORT_NUMBER));
    assert.ok(!Buffer.from(sealed.ct, 'base64').includes(Buffer.from(PASSPORT_NUMBER)));
    // Same value twice → different ciphertext (random IV).
    await put(chef, w.other._id, { number: PASSPORT_NUMBER });
    const sealed2 = h.attic.AtticDocument.docs.find((d) => String(d._id) === String(w.other._id)).secrets.number;
    assert.notEqual(sealed.ct, sealed2.ct);
    assert.notEqual(sealed.iv, sealed2.iv);
  });

  test('reveal decrypts one field, audit-logged by key (never value); Heather can reveal too', async () => {
    await put(chef, w.doc._id, { number: PASSPORT_NUMBER });
    const res = await reveal(chef, w.doc._id, 'number');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { key: 'number', value: PASSPORT_NUMBER });
    assert.equal(res.headers['cache-control'], 'no-store, max-age=0');
    const heather = h.unlock('heather');
    assert.equal((await reveal(heather, w.doc._id, 'number', 'heather')).body.value, PASSPORT_NUMBER);
    const reveals = h.attic.AtticAudit.docs.filter((a) => a.action === 'reveal');
    assert.equal(reveals.length, 2);
    assert.deepEqual(reveals.map((r) => r.field), ['number', 'number']);
    assert.ok(!JSON.stringify(h.attic.AtticAudit.docs).includes(PASSPORT_NUMBER));
  });

  test('locked, a kid, a non-identifier key, an unknown key → refused; null clears', async () => {
    await put(chef, w.doc._id, { number: PASSPORT_NUMBER });
    assert.equal((await reveal('', w.doc._id, 'number', 'heather')).status, 423);
    assert.equal((await reveal(chef, w.doc._id, 'number', 'kid')).status, 403);
    assert.equal((await reveal(chef, w.doc._id, 'country')).status, 404, 'a plain field is not served from here');
    assert.equal((await put(chef, w.doc._id, { country: 'USA' })).status, 400);
    assert.equal((await put(chef, w.doc._id, { 'secrets.$where': 'x' })).status, 400);
    assert.equal((await put(chef, w.theirs._id, { number: 'X' })).status, 404);
    const cleared = await put(chef, w.doc._id, { number: null });
    assert.deepEqual(cleared.body.identifiers, [{ key: 'number', hasValue: false }]);
    assert.deepEqual((await reveal(chef, w.doc._id, 'number')).body, { key: 'number', value: null });
  });

  test('a sealed value copied onto another document will not open there (bound to its place)', async () => {
    await put(chef, w.doc._id, { number: PASSPORT_NUMBER });
    const docs = h.attic.AtticDocument.docs;
    docs.find((d) => String(d._id) === String(w.other._id)).secrets = { number: structuredClone(docs.find((d) => String(d._id) === String(w.doc._id)).secrets.number) };
    const res = await reveal(chef, w.other._id, 'number');
    assert.equal(res.status, 500);
    assert.equal(res.body.code, 'ATTIC_UNREADABLE');
    assert.ok(!JSON.stringify(res.body).includes(PASSPORT_NUMBER));
  });
});

describe('key rotation (versioned keys)', () => {
  test('a retired key still opens what it sealed; new seals use the current version', () => {
    const k1 = crypto.randomBytes(32).toString('base64');
    const k2 = crypto.randomBytes(32).toString('base64');
    const v1 = loadVaultKeyring({ THINGGEEK_VAULT_KEY: k1 });
    const where = { householdId: 'default', documentId: String(newId()), key: 'number' };
    const old = v1.sealField({ ...where, plaintext: 'OLD-VALUE' });
    const v2 = loadVaultKeyring({ THINGGEEK_VAULT_KEY: k2, THINGGEEK_VAULT_KEY_VERSION: '2', THINGGEEK_VAULT_KEYS_RETIRED: `1:${k1}` });
    assert.equal(v2.openField({ ...where, sealed: old }), 'OLD-VALUE');
    assert.equal(v2.sealField({ ...where, plaintext: 'NEW' }).v, 2);
    assert.throws(() => loadVaultKeyring({ THINGGEEK_VAULT_KEY: k2, THINGGEEK_VAULT_KEY_VERSION: '2' }).openField({ ...where, sealed: old }));
    assert.equal(loadVaultKeyring({ THINGGEEK_VAULT_KEY: k2, THINGGEEK_VAULT_KEYS_RETIRED: 'nonsense' }).ok, false);
  });
});

describe('the purge', () => {
  test('a deleted document goes with its sealed files after the grace hour; live ones stay', async () => {
    await up(chef, w.doc._id, pdfBuffer(), 'a.pdf', 'page');
    await up(chef, w.other._id, pdfBuffer(), 'b.pdf', 'page');
    assert.equal(walk(h.filesPath).length, 2);
    h.attic.AtticDocument.docs.find((d) => String(d._id) === String(w.doc._id)).deletedAt = new Date(Date.now() - 2 * 3600 * 1000);
    const later = () => new Date(Date.now() + 2 * 3600 * 1000);
    const totals = await runPurge({ Thing: h.Thing, ThingFile: h.ThingFile, attic: h.attic, filesRoot: h.filesPath, now: later });
    assert.equal(totals.atticDocuments, 1);
    assert.equal(totals.atticFiles, 1);
    assert.equal(walk(h.filesPath).length, 1);
    assert.equal(h.attic.AtticFile.docs.length, 1);
    assert.ok(h.attic.AtticDocument.docs.every((d) => String(d._id) !== String(w.doc._id)));
  });

  test('an orphaned sealed file (no live document holds it) is removed once old', async () => {
    await up(chef, w.other._id, pdfBuffer(), 'b.pdf', 'page');
    h.attic.AtticDocument.docs.find((d) => String(d._id) === String(w.other._id)).files = [];
    await runPurge({ Thing: h.Thing, ThingFile: h.ThingFile, attic: h.attic, filesRoot: h.filesPath });
    assert.equal(h.attic.AtticFile.docs.length, 1, 'not yet: inside the grace hour');
    await runPurge({ Thing: h.Thing, ThingFile: h.ThingFile, attic: h.attic, filesRoot: h.filesPath, now: () => new Date(Date.now() + 2 * 3600 * 1000) });
    assert.equal(h.attic.AtticFile.docs.length, 0);
    assert.equal(walk(h.filesPath).length, 0);
  });
});

void mongoose;
