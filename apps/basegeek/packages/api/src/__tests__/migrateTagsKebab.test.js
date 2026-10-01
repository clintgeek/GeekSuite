/**
 * scripts/migrate-tags-kebab.js — the mapping/merge plan (pure) and one
 * dry-run / apply / rollback round trip against the in-memory Mongo, on a
 * private database so no other suite's collections are touched.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MongoClient, ObjectId } from 'mongodb';
import {
  migrateTag,
  migrateTagList,
  planCollection,
  formatTable,
  run,
  rollback,
  TARGETS,
} from '../../scripts/migrate-tags-kebab.js';

const silent = () => {};

describe('migrateTag / migrateTagList', () => {
  it('normalizes to the standard', () => {
    expect(migrateTag('GeekSuite').to).toBe('geek-suite');
    expect(migrateTag('House / Garage').to).toBe('house/garage');
    expect(migrateTag('🎉').to).toBe('');
  });

  it('truncates at the cap, never ending on a separator', () => {
    const { to, truncated } = migrateTag(`${'ab'.repeat(29)}cD`, 60); // 60 raw → 61 normalized
    expect(truncated).toBe(true);
    expect(to.length).toBeLessThanOrEqual(60);
    expect(to).not.toMatch(/[-/]$/);
    expect(migrateTag('short', 60)).toEqual({ to: 'short', truncated: false });
  });

  it('dedupes on the item after normalizing, first position wins', () => {
    expect(migrateTagList(['Work', 'home', 'work', 'WORK', '&&', 'geek_suite', 'GeekSuite'])).toEqual(['work', 'home', 'geek-suite']);
    expect(migrateTagList(null)).toEqual([]);
  });
});

describe('planCollection', () => {
  const docs = [
    { _id: 1, userId: 'u1', tags: ['Work', 'home'] },
    { _id: 2, userId: 'u1', tags: ['work', 'GeekSuite'] },
    { _id: 3, userId: 'u1', tags: ['work', 'WORK'] },
    { _id: 4, userId: 'u2', tags: ['Work'] },
    { _id: 5, userId: 'u2', tags: ['already-fine'] },
    { _id: 6, userId: 'u2', tags: ['🎉', 'party'] },
  ];

  it('plans only the items that change, with before and after', () => {
    const { changes } = planCollection(docs, { ownerField: 'userId' });
    expect(changes.map((c) => c._id)).toEqual([1, 2, 3, 4, 6]);
    expect(changes.find((c) => c._id === 3)).toEqual({ _id: 3, owner: 'u1', before: ['work', 'WORK'], after: ['work'] });
    expect(changes.find((c) => c._id === 6).after).toEqual(['party']);
  });

  it('rows say old → new, item counts, and what collapses together', () => {
    const { rows } = planCollection(docs, { ownerField: 'userId' });
    const row = (old) => rows.find((r) => r.old === old);
    expect(row('Work')).toMatchObject({ new: 'work', items: 2, owners: 2, mergesWith: ['WORK', 'work'] });
    expect(row('GeekSuite')).toMatchObject({ new: 'geek-suite', items: 1, mergesWith: [] });
    expect(row('🎉')).toMatchObject({ new: '', items: 1 });
    expect(row('already-fine')).toMatchObject({ new: 'already-fine', mergesWith: [] });
  });

  it('merges are owner-scoped: one owner\'s spelling never merges with another\'s', () => {
    const { rows } = planCollection([
      { _id: 1, userId: 'a', tags: ['Work'] },
      { _id: 2, userId: 'b', tags: ['work'] },
    ], { ownerField: 'userId' });
    expect(rows.find((r) => r.old === 'Work').mergesWith).toEqual([]);
  });

  it('stats', () => {
    const { stats } = planCollection(docs, { ownerField: 'userId' });
    expect(stats).toEqual({
      docs: 6, changedDocs: 5, spellings: 8, changedSpellings: 4, removedSpellings: 1, truncated: 0, collapsedOnItems: 1,
    });
  });

  it('is idempotent: planning the planned result changes nothing', () => {
    const { changes } = planCollection(docs, { ownerField: 'userId' });
    const migrated = docs.map((d) => ({ ...d, tags: changes.find((c) => c._id === d._id)?.after ?? d.tags }));
    const again = planCollection(migrated, { ownerField: 'userId' });
    expect(again.changes).toEqual([]);
    expect(again.rows.every((r) => r.old === r.new)).toBe(true);
  });

  it('the table shows changing spellings only', () => {
    const { rows } = planCollection(docs, { ownerField: 'userId' });
    const table = formatTable('notegeek', 'notes', rows);
    expect(table).toContain('"Work"');
    expect(table).toContain('(removed)');
    expect(table).not.toContain('"already-fine"');
    expect(formatTable('x', 'y', [])).toBe('x.y: nothing to change\n');
  });

  it('every real target is owner-scoped', () => {
    for (const t of TARGETS) expect(['userId', 'createdBy', 'householdId']).toContain(t.owner);
    expect(TARGETS.find((t) => t.app === 'thinggeek').maxLength).toBe(60);
  });
});

describe('run / rollback against Mongo', () => {
  const DB = `migrateTagsKebab_${process.pid}`;
  const targets = [{ app: 'notegeek', db: DB, collection: 'notes', owner: 'userId', maxLength: 100 }];
  let client;
  let dir;
  const owner = new ObjectId();
  const updatedAt = new Date('2026-01-01T00:00:00Z');

  beforeAll(async () => {
    client = new MongoClient(`${process.env.MONGO_BASE_URI}/?authSource=admin`);
    await client.connect();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tags-kebab-'));
  });

  afterAll(async () => {
    await client.db(DB).dropDatabase();
    await client.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const notes = client.db(DB).collection('notes');
    await notes.deleteMany({});
    await notes.insertMany([
      { _id: new ObjectId(), userId: owner, title: 'a', tags: ['Work', 'work', 'GeekSuite'], updatedAt },
      { _id: new ObjectId(), userId: owner, title: 'b', tags: ['house/garage'], updatedAt },
      { _id: new ObjectId(), userId: owner, title: 'c', tags: [], updatedAt },
    ]);
  });

  const allTags = async () => (await client.db(DB).collection('notes').find({}, { sort: { title: 1 } }).toArray()).map((n) => n.tags);

  it('the dry run writes nothing and leaves no rollback file', async () => {
    const { rollbackFile, results } = await run({ client, targets, rollbackDir: dir, log: silent });
    expect(rollbackFile).toBeNull();
    expect(results[0].changes).toHaveLength(1);
    expect(await allTags()).toEqual([['Work', 'work', 'GeekSuite'], ['house/garage'], []]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('apply writes tags only, saves a 600 rollback file first, and a second run plans nothing', async () => {
    const { rollbackFile } = await run({ client, targets, apply: true, rollbackDir: dir, log: silent });
    expect(await allTags()).toEqual([['work', 'geek-suite'], ['house/garage'], []]);
    expect(fs.statSync(rollbackFile).mode & 0o777).toBe(0o600);
    const note = await client.db(DB).collection('notes').findOne({ title: 'a' });
    expect(note.updatedAt).toEqual(updatedAt);

    const again = await run({ client, targets, apply: true, rollbackDir: dir, log: silent });
    expect(again.rollbackFile).toBeNull();
    expect(again.results[0].changes).toEqual([]);

    await rollback({ client, file: rollbackFile, log: silent });
    expect(await allTags()).toEqual([['Work', 'work', 'GeekSuite'], ['house/garage'], []]);
  });

  it('rollback leaves alone an item edited since the migration', async () => {
    const notes = client.db(DB).collection('notes');
    const { rollbackFile } = await run({ client, targets, apply: true, rollbackDir: dir, log: silent });
    await notes.updateOne({ title: 'a' }, { $set: { tags: ['edited'] } });
    const [res] = await rollback({ client, file: rollbackFile, log: silent });
    expect(res).toMatchObject({ restored: 0, skipped: 1 });
    expect((await notes.findOne({ title: 'a' })).tags).toEqual(['edited']);
  });
});
