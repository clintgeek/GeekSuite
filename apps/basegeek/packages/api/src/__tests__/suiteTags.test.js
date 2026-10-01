/**
 * suiteTags.test.js — tags across NoteGeek, BuJoGeek and ThingGeek
 * (graphql/suitetags). The rules that matter:
 *   1. per-app counts, in the suite standard (legacy spellings folded);
 *   2. owner-scoped notes/tasks; ThingGeek only for a household MEMBER, and
 *      only live things;
 *   3. a PRIVATE task is "Private task" with no snippet and no tags;
 *   4. a thing is its name only — no identifier ever appears.
 */
import mongoose from 'mongoose';
import householdModule from '@geeksuite/schemas/thinggeek/household';

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { default: Task } = await import('../graphql/bujogeek/models/Task.js');
const { Thing } = await import('../graphql/thinggeek/models/thing.js');
const { resolvers, PRIVATE_TASK_LABEL } = await import('../graphql/suitetags/resolvers.js');

const { MEMBER_USER_IDS, DEFAULT_HOUSEHOLD_ID } = householdModule;
const MEMBER = MEMBER_USER_IDS[0];
const OUTSIDER = String(new mongoose.Types.ObjectId());
const ctx = (id) => ({ user: { id: String(id) } });
const { Query } = resolvers;

const SERIAL = 'SN-SECRET-12345';

beforeAll(async () => {
  await Promise.all([Note.db.asPromise(), Task.db.asPromise(), Thing.db.asPromise()]);
}, 60000);

afterEach(async () => {
  await Promise.all([Note.deleteMany({}), Task.deleteMany({}), Thing.deleteMany({})]);
});

afterAll(async () => {
  await Promise.all([Note.db.close(), Task.db.close(), Thing.db.close()]);
});

async function seed() {
  const me = new mongoose.Types.ObjectId(MEMBER);
  const other = new mongoose.Types.ObjectId(OUTSIDER);
  await Note.create([
    { userId: me, title: 'Garage plan', content: '<p>Shelves along the <b>north</b> wall</p>', tags: ['house/garage', 'work'] },
    { userId: me, title: 'Locked', content: 'secret words', isLocked: true, tags: ['house'] },
    { userId: other, title: 'Not mine', content: 'x', tags: ['house'] },
  ]);
  await Task.create([
    { content: 'Buy pegboard', note: 'the 4x8 one', createdBy: me, tags: ['house/garage'] },
    { content: 'Fire Jane', note: 'talk to legal', createdBy: me, tags: ['house', 'hr'], private: true },
    { content: 'Legacy', createdBy: me, tags: ['geekSuite'] },
    { content: 'Theirs', createdBy: other, tags: ['house'] },
  ]);
  await Thing.create([
    { householdId: DEFAULT_HOUSEHOLD_ID, name: 'Shop vac', tags: ['house/garage'], attributes: { serial: SERIAL } },
    { householdId: DEFAULT_HOUSEHOLD_ID, name: 'Trashed drill', tags: ['house/garage'], deletedAt: new Date() },
  ]);
}

describe('suiteTags', () => {
  test('per-app counts across the three apps, legacy spellings folded', async () => {
    await seed();
    const tags = await Query.suiteTags(null, {}, ctx(MEMBER));
    const byTag = Object.fromEntries(tags.map((t) => [t.tag, t]));
    expect(byTag['house/garage']).toEqual({
      tag: 'house/garage',
      total: 3,
      apps: [{ app: 'notegeek', count: 1 }, { app: 'bujogeek', count: 1 }, { app: 'thinggeek', count: 1 }],
    });
    expect(byTag['geek-suite'].apps).toEqual([{ app: 'bujogeek', count: 1 }]);
    expect(byTag.house.total).toBe(2); // my locked note + my private task; never the other user's
    expect(tags[0].tag).toBe('house/garage'); // sorted by total
  });

  test('a non-member sees no ThingGeek counts (and no error)', async () => {
    await seed();
    const other = new mongoose.Types.ObjectId(OUTSIDER);
    await Note.create({ userId: other, title: 'g', content: 'x', tags: ['house/garage'] });
    const tags = await Query.suiteTags(null, {}, ctx(OUTSIDER));
    const garage = tags.find((t) => t.tag === 'house/garage');
    expect(garage.apps).toEqual([{ app: 'notegeek', count: 1 }]);
  });

  test('signed out is empty', async () => {
    expect(await Query.suiteTags(null, {}, {})).toEqual([]);
  });
});

describe('taggedAcross', () => {
  test('exact tag across the apps, owner-scoped, live things only', async () => {
    await seed();
    const rows = await Query.taggedAcross(null, { tag: 'House/Garage' }, ctx(MEMBER));
    expect(rows.map((r) => `${r.app}:${r.title}`).sort()).toEqual([
      'bujogeek:Buy pegboard', 'notegeek:Garage plan', 'thinggeek:Shop vac',
    ]);
    const note = rows.find((r) => r.app === 'notegeek');
    expect(note.snippet).toBe('Shelves along the north wall');
    expect(note.url).toMatch(/^https:\/\/notegeek\.clintgeek\.com\/notes\/[0-9a-f]{24}$/);
    expect(rows.find((r) => r.app === 'bujogeek').url).toBe('https://bujogeek.clintgeek.com/search?q=%23house%2Fgarage');
    expect(rows.find((r) => r.app === 'thinggeek').url).toMatch(/^https:\/\/thinggeek\.clintgeek\.com\/thing\//);
  });

  test('under: true takes the subtree; a locked note has no snippet', async () => {
    await seed();
    const rows = await Query.taggedAcross(null, { tag: 'house', under: true }, ctx(MEMBER));
    expect(rows.filter((r) => r.app === 'notegeek').map((r) => r.title).sort()).toEqual(['Garage plan', 'Locked']);
    expect(rows.find((r) => r.title === 'Locked').snippet).toBeNull();
    expect(rows.some((r) => r.title === 'Not mine' || r.title === 'Theirs')).toBe(false);
  });

  test('a private task is "Private task": no words, no note, no tags', async () => {
    await seed();
    const rows = await Query.taggedAcross(null, { tag: 'hr' }, ctx(MEMBER));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ app: 'bujogeek', title: PRIVATE_TASK_LABEL, snippet: null, tags: [] });
    expect(JSON.stringify(rows)).not.toMatch(/Jane|legal/);
  });

  test('a thing never carries an identifier', async () => {
    await seed();
    const rows = await Query.taggedAcross(null, { tag: 'house', under: true, apps: ['thinggeek'] }, ctx(MEMBER));
    expect(rows.map((r) => r.title)).toEqual(['Shop vac']);
    expect(JSON.stringify(rows)).not.toContain(SERIAL);
  });

  test('a non-member gets no things', async () => {
    await seed();
    const rows = await Query.taggedAcross(null, { tag: 'house/garage' }, ctx(OUTSIDER));
    expect(rows.some((r) => r.app === 'thinggeek')).toBe(false);
  });

  test('legacy spellings are found by the standard one', async () => {
    await seed();
    const rows = await Query.taggedAcross(null, { tag: 'geek-suite' }, ctx(MEMBER));
    expect(rows.map((r) => r.title)).toEqual(['Legacy']);
    expect(rows[0].tags).toEqual(['geek-suite']);
  });

  test('a tag that normalizes to nothing is empty', async () => {
    await seed();
    expect(await Query.taggedAcross(null, { tag: '&&' }, ctx(MEMBER))).toEqual([]);
  });
});
