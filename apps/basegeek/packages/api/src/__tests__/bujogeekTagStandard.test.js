/**
 * bujogeekTagStandard.test.js
 *
 * BuJoGeek tags follow the suite standard (2026-10-01, DOCS/TAG_STANDARD.md,
 * `@geeksuite/tags`): lowercase kebab-case, `/` for nesting.
 *   1. every write path stores the standard spelling — createTask,
 *      updateTask, addSubtask, journal entries, templates;
 *   2. tags stored BEFORE the standard (`geekSuite` — Chef's real data had
 *      seven such spellings on 121 tasks) are still found by their standard
 *      spelling, and read back in it, until the migration rewrites them.
 */
import mongoose from 'mongoose';

const { default: Task } = await import('../graphql/bujogeek/models/Task.js');
const { default: JournalEntry } = await import('../graphql/bujogeek/models/JournalEntry.js');
const { default: Template } = await import('../graphql/bujogeek/models/Template.js');
const { resolvers } = await import('../graphql/bujogeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => ({ user: { id: String(userId) } });
const { Query, Mutation } = resolvers;

beforeAll(async () => {
  await Task.db.asPromise();
}, 60000);

afterEach(async () => {
  await Task.deleteMany({});
  await JournalEntry.deleteMany({});
  await Template.deleteMany({});
});

afterAll(async () => {
  await Task.db.close();
});

const stored = async (id) => (await Task.findById(id).lean()).tags;

describe('writes store the standard spelling', () => {
  test('createTask normalizes, dedupes, keeps nesting', async () => {
    const t = await Mutation.createTask(null, { content: 'ship it', tags: ['GeekSuite', 'geek_suite', 'Work / On Call', '#home', '&&'] }, ctx(ALICE));
    expect(await stored(t._id)).toEqual(['geek-suite', 'work/on-call', 'home']);
  });

  test('updateTask normalizes', async () => {
    const t = await Mutation.createTask(null, { content: 'a' }, ctx(ALICE));
    await Mutation.updateTask(null, { id: String(t._id), input: { tags: ['offTicket', 'off-ticket', 'Lake Life'] } }, ctx(ALICE));
    expect(await stored(t._id)).toEqual(['off-ticket', 'lake-life']);
  });

  test('addSubtask normalizes', async () => {
    const parent = await Mutation.createTask(null, { content: 'p' }, ctx(ALICE));
    const child = await Mutation.addSubtask(null, { parentId: String(parent._id), content: 'c', tags: ['jobSearch'] }, ctx(ALICE));
    expect(await stored(child._id)).toEqual(['job-search']);
  });

  test('a tag that grows past 100 when normalized is refused', async () => {
    await expect(Mutation.createTask(null, { content: 'x', tags: ['aB'.repeat(50)] }, ctx(ALICE)))
      .rejects.toMatchObject({ extensions: expect.objectContaining({ code: 'BAD_USER_INPUT' }) });
  });

  test('journal entries and templates store the standard spelling', async () => {
    const e = await Mutation.createJournalEntry(null, { title: 't', content: 'c', tags: ['FarmLife', 'farm life'] }, ctx(ALICE));
    expect((await JournalEntry.findById(e._id).lean()).tags).toEqual(['farm-life']);
    await Mutation.updateJournalEntry(null, { id: String(e._id), tags: ['onCall'] }, ctx(ALICE));
    expect((await JournalEntry.findById(e._id).lean()).tags).toEqual(['on-call']);

    const tpl = await Mutation.createTemplate(null, { name: 'n', content: 'c', tags: ['HobbyCoding'] }, ctx(ALICE));
    expect((await Template.findById(tpl._id).lean()).tags).toEqual(['hobby-coding']);
    await Mutation.updateTemplate(null, { id: String(tpl._id), tags: ['Hobby Coding', 'x'] }, ctx(ALICE));
    expect((await Template.findById(tpl._id).lean()).tags).toEqual(['hobby-coding', 'x']);
  });
});

describe('legacy (pre-standard) tags are tolerated until the migration', () => {
  let legacy;
  let standard;
  beforeEach(async () => {
    // Written straight to the collection, the way the old gateway stored them.
    legacy = await Task.create({ content: 'legacy', createdBy: ALICE, tags: ['geekSuite', 'offTicket'] });
    standard = await Task.create({ content: 'standard', createdBy: ALICE, tags: ['geek-suite'] });
    await Task.create({ content: 'other', createdBy: ALICE, tags: ['farmLife'] });
    await Task.create({ content: 'bob', createdBy: BOB, tags: ['geekSuite'] });
  });

  const contents = (list) => list.map((t) => t.content).sort();

  test('tasks(tags:) finds legacy spellings by the standard one — and by the legacy one', async () => {
    expect(contents(await Query.tasks(null, { tags: ['geek-suite'] }, ctx(ALICE)))).toEqual(['legacy', 'standard']);
    expect(contents(await Query.tasks(null, { tags: ['geekSuite'] }, ctx(ALICE)))).toEqual(['legacy', 'standard']);
  });

  test('tasksByTag finds legacy spellings, owner-scoped', async () => {
    expect(contents(await Query.tasksByTag(null, { tag: 'geek-suite' }, ctx(ALICE)))).toEqual(['legacy', 'standard']);
    expect(contents(await Query.tasksByTag(null, { tag: 'off-ticket' }, ctx(ALICE)))).toEqual(['legacy']);
  });

  test('taskTags folds legacy spellings into the standard tag', async () => {
    expect(await Query.taskTags(null, {}, ctx(ALICE))).toEqual([
      { tag: 'geek-suite', count: 2 },
      { tag: 'farm-life', count: 1 },
      { tag: 'off-ticket', count: 1 },
    ]);
  });

  test('Task.tags reads in the standard spelling', async () => {
    expect(resolvers.Task.tags(legacy.toObject())).toEqual(['geek-suite', 'off-ticket']);
    expect(resolvers.Task.tags(standard.toObject())).toEqual(['geek-suite']);
    expect(resolvers.Task.tags({ tags: null })).toBeNull();
  });

  test('journalEntries(tags:) finds legacy spellings', async () => {
    await JournalEntry.create({ title: 'old', content: 'c', createdBy: ALICE, tags: ['geekSuite'] });
    await JournalEntry.create({ title: 'new', content: 'c', createdBy: ALICE, tags: ['geek-suite'] });
    const list = await Query.journalEntries(null, { tags: ['geek-suite'] }, ctx(ALICE));
    expect(list.map((e) => e.title).sort()).toEqual(['new', 'old']);
  });
});
