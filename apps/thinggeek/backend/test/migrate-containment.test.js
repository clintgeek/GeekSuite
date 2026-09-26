/**
 * scripts/migrate-containment.js — the Place tree → the containment graph.
 *
 * Runs against a REAL throwaway mongod (drop-a-collection and _id-preserving
 * inserts are what matter, and the fake model can't honestly stand in for
 * them). The binary is the one mongodb-memory-server caches for the gateway's
 * tests (~/.cache/mongodb-binaries), or THINGGEEK_TEST_MONGOD; with neither,
 * the suite is skipped (said so, not silently passed).
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import thingConstants from '@geeksuite/schemas/thinggeek/constants';
import { migrateContainment } from '../scripts/migrate-containment.js';

const { STARTER_TYPES, STARTER_TYPES_VERSION } = thingConstants;
const { ObjectId } = mongoose.Types;

function findMongod() {
  if (process.env.THINGGEEK_TEST_MONGOD) return process.env.THINGGEEK_TEST_MONGOD;
  const dir = path.join(os.homedir(), '.cache', 'mongodb-binaries');
  const bins = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^mongod-.*-7\./.test(f)).sort() : [];
  return bins.length ? path.join(dir, bins[bins.length - 1]) : null;
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

const MONGOD = findMongod();
const skip = MONGOD ? false : 'no mongod binary (set THINGGEEK_TEST_MONGOD to run)';

let proc;
let dbPath;
let conn;
let db;

async function startMongod() {
  dbPath = fs.mkdtempSync(path.join(os.tmpdir(), 'thinggeek-migrate-'));
  const port = await freePort();
  proc = spawn(MONGOD, ['--dbpath', dbPath, '--port', String(port), '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore' });
  const uri = `mongodb://127.0.0.1:${port}/thinggeek_migrate_test_${process.pid}`;
  for (let i = 0; i < 100; i += 1) {
    try {
      conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 300 }).asPromise();
      db = conn.db;
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('mongod did not start');
}

const HH = 'default';
const quiet = () => {};
const lines = [];
const capture = (l) => lines.push(l);
const run = (opts = {}) => migrateContainment({ db, log: quiet, ...opts });

/** A version-1 household like production: the nine old starter types (no kind), a seeded profile. */
async function seedV1({ skipKeys = [] } = {}) {
  const at = new Date('2026-09-25T20:00:00Z');
  const v1 = STARTER_TYPES.filter((t) => (t.since ?? 1) === 1 && !skipKeys.includes(t.key));
  await db.collection('thingtypes').insertMany(
    v1.map((t) => ({ householdId: HH, key: t.key, name: t.name, icon: t.icon, builtIn: true, fields: [], createdAt: at, updatedAt: at }))
  );
  await db.collection('thingprofiles').insertOne({ householdId: HH, userId: 'chef', savedFilters: [], starterTypesSeededAt: at });
}

/** House › Garage › Shelf 2, House › Office, and a Boathouse root. */
async function seedPlaces(householdId = HH) {
  const ids = { house: new ObjectId(), garage: new ObjectId(), shelf: new ObjectId(), office: new ObjectId(), boathouse: new ObjectId() };
  await db.collection('places').insertMany([
    { _id: ids.house, householdId, name: 'House', parentId: null, notes: 'the front door' },
    { _id: ids.garage, householdId, name: 'Garage', parentId: ids.house, notes: '' },
    { _id: ids.shelf, householdId, name: 'Shelf 2', parentId: ids.garage, notes: 'top one' },
    { _id: ids.office, householdId, name: 'Office', parentId: ids.house },
    { _id: ids.boathouse, householdId, name: 'The Boathouse', parentId: null },
  ]);
  return ids;
}

async function snapshot() {
  const out = {};
  for (const c of (await db.listCollections().toArray()).map((x) => x.name).sort()) {
    out[c] = await db.collection(c).find({}).sort({ _id: 1 }).toArray();
  }
  return JSON.stringify(out);
}

describe('migrate-containment', { skip }, () => {
  before(startMongod);
  after(async () => {
    if (db) await db.dropDatabase();
    await conn?.close();
    proc?.kill();
    if (dbPath) fs.rmSync(dbPath, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await db.dropDatabase();
    await db.collection('thingtypes').createIndex({ householdId: 1, key: 1 }, { unique: true });
    lines.length = 0;
  });

  test('a dry run writes nothing (with or without --drop-places)', async () => {
    await seedV1();
    await seedPlaces();
    const before = await snapshot();
    const out = await migrateContainment({ db, log: capture });
    await migrateContainment({ db, log: quiet, dropPlaces: true });
    assert.equal(await snapshot(), before);
    assert.equal(out.placesConverted, 5);
    assert.equal(out.kindsSet, 9);
    assert.equal(out.typesAdded, 2);
    assert.ok(lines[0].includes('DRY RUN'));
    assert.ok(lines.at(-1).includes('nothing was written'));
  });

  test('apply converts the tree (same ids, parentage, names, notes) into Location things', async () => {
    await seedV1();
    const ids = await seedPlaces();
    await run({ apply: true });
    const location = await db.collection('thingtypes').findOne({ householdId: HH, key: 'location' });
    assert.equal(location.kind, 'location');
    const things = await db.collection('things').find({}).toArray();
    assert.equal(things.length, 5);
    const byId = new Map(things.map((t) => [String(t._id), t]));
    const get = (k) => byId.get(String(ids[k]));
    assert.equal(get('house').parentId, null);
    assert.equal(String(get('garage').parentId), String(ids.house));
    assert.equal(String(get('shelf').parentId), String(ids.garage));
    assert.equal(String(get('office').parentId), String(ids.house));
    assert.equal(get('shelf').name, 'Shelf 2');
    assert.equal(get('shelf').notes, 'top one');
    assert.equal(get('office').notes, '');
    assert.equal(get('boathouse').sortName, 'boathouse, the');
    for (const t of things) {
      assert.equal(String(t.typeId), String(location._id));
      assert.equal(t.householdId, HH);
      assert.equal(t.deletedAt, null);
      assert.deepEqual([t.tags, t.photos, t.documents, t.relationships, t.dates], [[], [], [], [], []]);
      assert.deepEqual(t.attributes, {});
      assert.equal(t.value.currency, 'USD');
    }
    // Places are kept without --drop-places.
    assert.equal(await db.collection('places').countDocuments(), 5);
  });

  test('kinds: starters get theirs, a custom type gets item, a stored kind is kept; Location + Storage added once', async () => {
    await seedV1({ skipKeys: ['keyboard'] }); // the household deleted Keyboard
    await db.collection('thingtypes').insertMany([
      { householdId: HH, key: 'kayak', name: 'Kayak', fields: [] },
      { householdId: HH, key: 'safe', name: 'Safe', fields: [], kind: 'container' },
    ]);
    await run({ apply: true });
    const kinds = Object.fromEntries((await db.collection('thingtypes').find({ householdId: HH }).toArray()).map((t) => [t.key, t.kind]));
    assert.equal(kinds.boat, 'container');
    assert.equal(kinds.vehicle, 'container');
    assert.equal(kinds.firearm, 'item');
    assert.equal(kinds.general, 'item');
    assert.equal(kinds.kayak, 'item');
    assert.equal(kinds.safe, 'container');
    assert.equal(kinds.location, 'location');
    assert.equal(kinds.storage, 'container');
    assert.ok(!('keyboard' in kinds), 'a deleted v1 starter type is not resurrected');
    const storage = await db.collection('thingtypes').findOne({ householdId: HH, key: 'storage' });
    assert.equal(storage.builtIn, true);
    assert.deepEqual(storage.fields.find((f) => f.key === 'serial').identifier, true);
    const profile = await db.collection('thingprofiles').findOne({ householdId: HH });
    assert.equal(profile.starterTypesVersion, STARTER_TYPES_VERSION);
    // The household later deletes Storage: a re-run leaves it deleted.
    await db.collection('thingtypes').deleteOne({ householdId: HH, key: 'storage' });
    const again = await run({ apply: true });
    assert.equal(again.typesAdded, 0);
    assert.equal(await db.collection('thingtypes').countDocuments({ key: 'storage' }), 0);
  });

  test('a second apply is a no-op and says so', async () => {
    await seedV1();
    await seedPlaces();
    await run({ apply: true });
    const before = await snapshot();
    const out = await migrateContainment({ db, apply: true, log: capture });
    assert.equal(await snapshot(), before);
    assert.equal(out.placesConverted, 0);
    assert.equal(out.placesAlreadyConverted, 5);
    assert.equal(out.kindsSet + out.typesAdded + out.profilesMarked, 0);
    assert.equal(lines.at(-1), 'nothing to do — already migrated');
  });

  test('--drop-places drops only with --apply, and only once every place is a thing', async () => {
    await seedV1();
    await seedPlaces();
    await run({ dropPlaces: true });
    assert.equal(await db.collection('places').countDocuments(), 5);
    const out = await run({ apply: true, dropPlaces: true });
    assert.equal(out.placesDropped, true);
    assert.equal((await db.listCollections({ name: 'places' }).toArray()).length, 0);
    assert.equal(await db.collection('things').countDocuments(), 5);
    // And afterwards it is still happy.
    const again = await run({ apply: true, dropPlaces: true });
    assert.equal(again.placesDropped, false);
  });

  test('legacy placeId → parentId; retired relationship kinds pulled; accessory-of kept', async () => {
    await seedV1();
    const ids = await seedPlaces();
    const drillId = new ObjectId();
    const lensId = new ObjectId();
    const camId = new ObjectId();
    await db.collection('things').insertMany([
      { _id: drillId, householdId: HH, name: 'Drill', placeId: ids.shelf, parentId: null, relationships: [{ _id: new ObjectId(), kind: 'stored-with', thingId: camId }] },
      { _id: camId, householdId: HH, name: 'Camera', placeId: null, relationships: [] },
      {
        _id: lensId, householdId: HH, name: 'Lens', parentId: null,
        relationships: [{ _id: new ObjectId(), kind: 'accessory-of', thingId: camId }, { _id: new ObjectId(), kind: 'part-of', thingId: camId }],
      },
    ]);
    const out = await run({ apply: true });
    assert.equal(out.thingsReparented, 1);
    assert.equal(out.legacyPlaceIdsUnset, 2);
    assert.equal(out.thingsWithLegacyRelationships, 2);
    const drill = await db.collection('things').findOne({ _id: drillId });
    assert.equal(String(drill.parentId), String(ids.shelf));
    assert.ok(!('placeId' in drill));
    assert.deepEqual(drill.relationships, []);
    assert.ok(!('placeId' in (await db.collection('things').findOne({ _id: camId }))));
    const lens = await db.collection('things').findOne({ _id: lensId });
    assert.deepEqual(lens.relationships.map((r) => r.kind), ['accessory-of']);
  });

  test('households stay apart: a place is re-parented only within its own household', async () => {
    await seedV1();
    const mine = await seedPlaces();
    // Their place claims MY house as its parent.
    const theirs = new ObjectId();
    await db.collection('places').insertOne({ _id: theirs, householdId: 'other', name: 'Their shed', parentId: mine.house });
    await run({ apply: true });
    const shed = await db.collection('things').findOne({ _id: theirs });
    assert.equal(shed.householdId, 'other');
    assert.equal(shed.parentId, null);
    const theirLocation = await db.collection('thingtypes').findOne({ householdId: 'other', key: 'location' });
    assert.equal(String(shed.typeId), String(theirLocation._id));
    // The unseeded household got only the Location type it needed.
    assert.equal(await db.collection('thingtypes').countDocuments({ householdId: 'other' }), 1);
  });
});
