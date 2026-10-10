/**
 * scripts/rename-bujogeek-to-todogeek.js — the planners (pure) and one
 * dry-run / apply / re-run round trip against the in-memory Mongo, on private
 * databases so no other suite's collections are touched.
 */
import { MongoClient, ObjectId } from 'mongodb';
import {
  renameAppId,
  planAppPreferences,
  planRegistry,
  planAppConfig,
  planSpend,
  renameStickyKey,
  run,
  COLLECTIONS,
} from '../../scripts/rename-bujogeek-to-todogeek.js';

const silent = () => {};

describe('renameAppId', () => {
  it('renames the old app in any case, keeping a :feature suffix', () => {
    expect(renameAppId('bujogeek')).toBe('todogeek');
    expect(renameAppId('BuJoGeek')).toBe('todogeek');
    expect(renameAppId('bujoGeek:review')).toBe('todogeek:review');
  });
  it('leaves everything else alone', () => {
    expect(renameAppId('todogeek')).toBeNull();
    expect(renameAppId('bujogeeks')).toBeNull();
    expect(renameAppId('notegeek')).toBeNull();
    expect(renameAppId(null)).toBeNull();
  });
});

describe('planAppPreferences', () => {
  it('renames when only the old key exists', () => {
    expect(planAppPreferences({ bujogeek: { a: 1 } })).toEqual({ kind: 'rename' });
  });
  it('merges when both exist, the new key winning per field', () => {
    expect(planAppPreferences({ bujogeek: { a: 1, b: 1 }, todogeek: { b: 2 } }))
      .toEqual({ kind: 'merge', merged: { a: 1, b: 2 } });
  });
  it('does nothing without the old key', () => {
    expect(planAppPreferences({ todogeek: { a: 1 } })).toEqual({ kind: 'none' });
    expect(planAppPreferences(undefined)).toEqual({ kind: 'none' });
  });
});

describe('planRegistry', () => {
  it('renames the old row in place, taking copy from DEFAULT_APPS', () => {
    const plan = planRegistry({ name: 'bujogeek', sortOrder: 2 }, null);
    expect(plan.kind).toBe('rename');
    expect(plan.set).toEqual({
      name: 'todogeek',
      displayName: 'todoGeek',
      url: 'https://todogeek.clintgeek.com',
      description: 'Tasks, habits & lists',
    });
  });
  it('folds customizations into a seeded new row', () => {
    const plan = planRegistry({ name: 'bujogeek', sortOrder: 7, enabled: false, color: '#000' }, { name: 'todogeek' });
    expect(plan).toEqual({ kind: 'fold', set: { sortOrder: 7, enabled: false, color: '#000' } });
  });
  it('is a no-op without the old row', () => {
    expect(planRegistry(null, { name: 'todogeek' })).toEqual({ kind: 'none' });
  });
});

describe('planAppConfig', () => {
  it('renames, replacing an auto-discovered stub', () => {
    expect(planAppConfig({ appName: 'bujogeek', displayName: 'BuJoGeek' }, { autoDiscovered: true }))
      .toEqual({ kind: 'rename', appName: 'todogeek', displayName: 'TodoGeek', dropTarget: true });
  });
  it('refuses to clobber a hand-configured row', () => {
    expect(planAppConfig({ appName: 'bujogeek' }, { autoDiscovered: false })).toEqual({ kind: 'conflict' });
  });
});

describe('planSpend / renameStickyKey', () => {
  it('merges a ledger bucket that already exists under the new name', () => {
    expect(planSpend({ calls: 2, costUsd: 0.01 }, null)).toEqual({ kind: 'rename' });
    expect(planSpend({ calls: 2, costUsd: 0.01 }, { calls: 1 }))
      .toEqual({ kind: 'merge', inc: { calls: 2, costUsd: 0.01, refusals: 0 } });
  });
  it('re-prefixes a sticky key', () => {
    expect(renameStickyKey('bujogeek:abc:def')).toBe('todogeek:abc:def');
    expect(renameStickyKey('notegeek:abc')).toBeNull();
  });
});

describe('run — round trip against Mongo', () => {
  let client;
  let dbs;
  const tag = `rn${Date.now()}`;

  beforeAll(async () => {
    client = new MongoClient(process.env.MONGODB_TEST_URI);
    await client.connect();
    dbs = {
      userGeek: client.db(`${tag}_user`),
      datageek: client.db(`${tag}_data`),
      aiGeek: client.db(`${tag}_ai`),
      todogeek: client.db(`${tag}_todo`),
      bujogeek: client.db(`${tag}_bujo`),
    };
  });

  afterAll(async () => {
    for (const db of Object.values(dbs)) await db.dropDatabase().catch(() => {});
    await client.close();
  });

  const day = '2026-10-10';

  async function seed() {
    const u1 = new ObjectId();
    const u2 = new ObjectId();
    await dbs.userGeek.collection(COLLECTIONS.users).insertMany([
      { _id: u1, appPreferences: { bujogeek: { aiReviewDraft: true }, notegeek: { x: 1 } }, preferences: { defaultApp: 'bujogeek' } },
      { _id: u2, appPreferences: { bujogeek: { a: 1, b: 1 }, todogeek: { b: 2 } }, preferences: { defaultApp: 'notegeek' } },
    ]);
    await dbs.datageek.collection(COLLECTIONS.apps).insertOne(
      { name: 'bujogeek', displayName: 'bujoGeek', url: 'https://bujogeek.clintgeek.com', description: 'Bullet journal & tasks', sortOrder: 2, enabled: true }
    );
    await dbs.aiGeek.collection(COLLECTIONS.aiAppConfigs).insertMany([
      { appName: 'bujogeek', displayName: 'BuJoGeek', allowPaid: true, paidFirst: true },
      { appName: 'todogeek', autoDiscovered: true, tier: 'auto' },
    ]);
    await dbs.aiGeek.collection(COLLECTIONS.aiSpends).insertMany([
      { day, provider: 'openrouter', app: 'bujogeek', feature: 'review', calls: 2, costUsd: 0.02, refusals: 0 },
      { day, provider: 'openrouter', app: 'todogeek', feature: 'review', calls: 1, costUsd: 0.01, refusals: 1 },
      { day: '2026-10-09', provider: 'groq', app: 'bujogeek', feature: '', calls: 5, costUsd: 0, refusals: 0 },
    ]);
    await dbs.aiGeek.collection(COLLECTIONS.aiStickyPicks).insertOne({ key: 'bujogeek:c1', app: 'bujogeek', provider: 'groq', modelId: 'm' });
    await dbs.aiGeek.collection(COLLECTIONS.apiKeys).insertOne({ appName: 'bujogeek', keyPrefix: 'p' });
    await dbs.aiGeek.collection(COLLECTIONS.conversations).insertOne({ appName: 'bujogeek', conversationId: 'c1' });
    // The DB copy: the same subscriptions in both, plus one made on the new origin.
    const oldSub = { endpoint: 'https://push.example/old', keys: { p256dh: 'p', auth: 'a' } };
    await dbs.bujogeek.collection(COLLECTIONS.pushSubscriptions).insertOne({ ...oldSub });
    await dbs.todogeek.collection(COLLECTIONS.pushSubscriptions).insertMany([
      { ...oldSub },
      { endpoint: 'https://push.example/new', keys: { p256dh: 'p', auth: 'a' } },
    ]);
    return { u1, u2 };
  }

  it('refuses --apply while the todogeek DB is empty', async () => {
    const empty = { ...dbs, todogeek: client.db(`${tag}_empty`) };
    await expect(run({ dbs: empty, apply: true, log: silent })).rejects.toThrow(/Refusing to --apply/);
  });

  it('dry run writes nothing; apply renames everything; a re-run plans nothing', async () => {
    const { u1, u2 } = await seed();

    const dry = await run({ dbs, apply: false, log: silent });
    expect(dry.users).toEqual({ renamed: 1, merged: 1, defaultApp: 1 });
    expect(dry.apps).toBe('rename');
    expect(dry.aiAppConfigs).toEqual({ renamed: 1, replacedStub: 1, conflict: 0 });
    expect(dry.aiSpends).toEqual({ renamed: 1, merged: 1 });
    expect(dry.pushSubscriptions).toBe(1);
    expect(await dbs.datageek.collection(COLLECTIONS.apps).findOne({ name: 'bujogeek' })).not.toBeNull();

    await run({ dbs, apply: true, log: silent });

    const users = dbs.userGeek.collection(COLLECTIONS.users);
    const a = await users.findOne({ _id: u1 });
    expect(a.appPreferences).toEqual({ todogeek: { aiReviewDraft: true }, notegeek: { x: 1 } });
    expect(a.preferences.defaultApp).toBe('todogeek');
    const b = await users.findOne({ _id: u2 });
    expect(b.appPreferences).toEqual({ todogeek: { a: 1, b: 2 } });
    expect(b.preferences.defaultApp).toBe('notegeek');

    const appsCol = dbs.datageek.collection(COLLECTIONS.apps);
    expect(await appsCol.countDocuments({ name: 'bujogeek' })).toBe(0);
    const reg = await appsCol.findOne({ name: 'todogeek' });
    expect(reg).toMatchObject({ displayName: 'todoGeek', url: 'https://todogeek.clintgeek.com', sortOrder: 2 });

    const cfg = await dbs.aiGeek.collection(COLLECTIONS.aiAppConfigs).find({}).toArray();
    expect(cfg).toHaveLength(1);
    expect(cfg[0]).toMatchObject({ appName: 'todogeek', displayName: 'TodoGeek', paidFirst: true });

    const spend = dbs.aiGeek.collection(COLLECTIONS.aiSpends);
    expect(await spend.countDocuments({ app: 'bujogeek' })).toBe(0);
    const merged = await spend.findOne({ day, app: 'todogeek', feature: 'review' });
    expect(merged.calls).toBe(3);
    expect(merged.costUsd).toBeCloseTo(0.03);
    expect(merged.refusals).toBe(1);
    expect(await spend.countDocuments({ app: 'todogeek' })).toBe(2);

    expect(await dbs.aiGeek.collection(COLLECTIONS.aiStickyPicks).findOne({})).toMatchObject({ key: 'todogeek:c1', app: 'todogeek' });
    expect((await dbs.aiGeek.collection(COLLECTIONS.apiKeys).findOne({})).appName).toBe('todogeek');
    expect((await dbs.aiGeek.collection(COLLECTIONS.conversations).findOne({})).appName).toBe('todogeek');

    const subs = await dbs.todogeek.collection(COLLECTIONS.pushSubscriptions).find({}).toArray();
    expect(subs.map((s) => s.endpoint)).toEqual(['https://push.example/new']);

    const again = await run({ dbs, apply: false, log: silent });
    expect(again.users).toEqual({ renamed: 0, merged: 0, defaultApp: 0 });
    expect(again.apps).toBe('none');
    expect(again.aiAppConfigs).toEqual({ renamed: 0, replacedStub: 0, conflict: 0 });
    expect(again.aiSpends).toEqual({ renamed: 0, merged: 0 });
    expect(again.aiStickyPicks).toEqual({ renamed: 0, dropped: 0 });
    expect(again[COLLECTIONS.apiKeys]).toBe(0);
    expect(again[COLLECTIONS.conversations]).toBe(0);
    expect(again.pushSubscriptions).toBe(0);
  });
});

describe('COLLECTIONS match the models the gateway writes through', () => {
  it('names the same collections mongoose does', async () => {
    const { default: AIAppConfig } = await import('../models/AIAppConfig.js');
    const { default: AISpend } = await import('../models/AISpend.js');
    const { default: AIStickyPick } = await import('../models/AIStickyPick.js');
    const { default: APIKey } = await import('../models/APIKey.js');
    const { default: Conversation } = await import('../models/Conversation.js');
    const { default: App } = await import('../models/App.js');
    const { User } = await import('../models/user.js');
    const { default: PushSubscription } = await import('../graphql/todogeek/models/PushSubscription.js');
    expect(AIAppConfig.collection.collectionName).toBe(COLLECTIONS.aiAppConfigs);
    expect(AISpend.collection.collectionName).toBe(COLLECTIONS.aiSpends);
    expect(AIStickyPick.collection.collectionName).toBe(COLLECTIONS.aiStickyPicks);
    expect(APIKey.collection.collectionName).toBe(COLLECTIONS.apiKeys);
    expect(Conversation.collection.collectionName).toBe(COLLECTIONS.conversations);
    expect(App.collection.collectionName).toBe(COLLECTIONS.apps);
    expect(User.collection.collectionName).toBe(COLLECTIONS.users);
    expect(PushSubscription.collection.collectionName).toBe(COLLECTIONS.pushSubscriptions);
  });
});
