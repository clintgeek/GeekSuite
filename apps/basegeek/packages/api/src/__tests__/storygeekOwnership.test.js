/**
 * storygeekOwnership.test.js
 *
 * StoryGeek stories are personal creative work, so the gateway module must be
 * strictly owner-scoped:
 *   1. Every read is filtered by `userId` — another user's story id resolves
 *      to null rather than to an "unauthorized" oracle that would confirm the
 *      id exists.
 *   2. Every mutation requires an authenticated user and refuses to touch a
 *      story owned by anyone else.
 *   3. Malformed ids behave as not-found instead of throwing a CastError.
 */

import mongoose from 'mongoose';

const { default: Story } = await import('../graphql/storygeek/models/Story.js');
const { resolvers } = await import('../graphql/storygeek/resolvers.js');

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: String(userId) } } : {});

const makeStory = (overrides = {}) =>
  Story.create({
    userId: String(ALICE),
    title: 'The Long Dark',
    genre: 'fantasy',
    status: 'active',
    ...overrides,
  });

beforeAll(async () => {
  await Story.db.asPromise();
}, 60000);

afterEach(async () => {
  await Story.deleteMany({});
});

afterAll(async () => {
  await Story.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('storygeek — ownership scoping', () => {
  test('stories lists only the caller’s stories', async () => {
    await makeStory();
    await makeStory({ userId: String(BOB), title: 'Bob’s Saga' });

    const alice = await resolvers.Query.stories(null, {}, ctx(ALICE));
    expect(alice).toHaveLength(1);
    expect(alice[0].title).toBe('The Long Dark');

    const bob = await resolvers.Query.stories(null, {}, ctx(BOB));
    expect(bob).toHaveLength(1);
    expect(bob[0].title).toBe('Bob’s Saga');
  });

  test('stories honours the status filter without widening the owner filter', async () => {
    await makeStory({ status: 'paused' });
    await makeStory({ userId: String(BOB), status: 'paused', title: 'Bob paused' });

    const paused = await resolvers.Query.stories(null, { status: 'paused' }, ctx(ALICE));
    expect(paused).toHaveLength(1);
    expect(String(paused[0].userId)).toBe(String(ALICE));

    expect(await resolvers.Query.stories(null, { status: 'active' }, ctx(ALICE))).toHaveLength(0);
  });

  test('stories returns an empty list when unauthenticated', async () => {
    await makeStory();
    expect(await resolvers.Query.stories(null, {}, ctx(null))).toEqual([]);
  });

  test('story returns null for another user’s story (no existence oracle)', async () => {
    const s = await makeStory();

    const mine = await resolvers.Query.story(null, { id: String(s._id) }, ctx(ALICE));
    expect(mine).not.toBeNull();
    expect(mine.title).toBe('The Long Dark');

    expect(await resolvers.Query.story(null, { id: String(s._id) }, ctx(BOB))).toBeNull();
  });

  test('story rejects unauthenticated callers', async () => {
    const s = await makeStory();
    await expect(
      resolvers.Query.story(null, { id: String(s._id) }, ctx(null))
    ).rejects.toThrow('Unauthorized');
  });

  test('story treats a malformed id as not-found, not a CastError', async () => {
    expect(await resolvers.Query.story(null, { id: 'not-an-objectid' }, ctx(ALICE))).toBeNull();
    expect(await resolvers.Query.story(null, { id: '' }, ctx(ALICE))).toBeNull();
  });

  test('updateStoryStatus cannot touch another user’s story', async () => {
    const s = await makeStory();
    await expect(
      resolvers.Mutation.updateStoryStatus(null, { id: String(s._id), status: 'abandoned' }, ctx(BOB))
    ).rejects.toThrow('Story not found');
    expect((await Story.findById(s._id)).status).toBe('active');
  });

  test('updateStoryStatus works for the owner', async () => {
    const s = await makeStory();
    const updated = await resolvers.Mutation.updateStoryStatus(
      null,
      { id: String(s._id), status: 'completed' },
      ctx(ALICE)
    );
    expect(updated.status).toBe('completed');
    expect((await Story.findById(s._id)).status).toBe('completed');
  });

  test('deleteStory cannot delete another user’s story', async () => {
    const s = await makeStory();
    await expect(
      resolvers.Mutation.deleteStory(null, { id: String(s._id) }, ctx(BOB))
    ).rejects.toThrow('Story not found');
    expect(await Story.findById(s._id)).not.toBeNull();

    expect(await resolvers.Mutation.deleteStory(null, { id: String(s._id) }, ctx(ALICE))).toBe(true);
    expect(await Story.findById(s._id)).toBeNull();
  });

  test('createStory stamps the caller as owner and ignores nothing else', async () => {
    const created = await resolvers.Mutation.createStory(
      null,
      { title: 'New Tale', genre: 'scifi', description: 'a start' },
      ctx(BOB)
    );
    expect(String(created.userId)).toBe(String(BOB));
    expect(await resolvers.Query.story(null, { id: String(created._id) }, ctx(ALICE))).toBeNull();
  });

  test('unauthenticated mutations throw Unauthorized', async () => {
    const s = await makeStory();
    for (const call of [
      () => resolvers.Mutation.createStory(null, { title: 't', genre: 'g' }, ctx(null)),
      () => resolvers.Mutation.updateStoryStatus(null, { id: String(s._id), status: 'paused' }, ctx(null)),
      () => resolvers.Mutation.deleteStory(null, { id: String(s._id) }, ctx(null)),
    ]) {
      await expect(call()).rejects.toThrow('Unauthorized');
    }
    expect(await Story.countDocuments({})).toBe(1);
    expect((await Story.findById(s._id)).status).toBe('active');
  });

  test('mutations treat malformed ids as not-found', async () => {
    await expect(
      resolvers.Mutation.updateStoryStatus(null, { id: 'garbage', status: 'paused' }, ctx(ALICE))
    ).rejects.toThrow('Story not found');
    await expect(
      resolvers.Mutation.deleteStory(null, { id: 'garbage' }, ctx(ALICE))
    ).rejects.toThrow('Story not found');
  });

  test('Story field resolvers preserve the response shape', async () => {
    const s = await makeStory({
      storyState: { currentLocation: { name: 'Harbour', description: 'salt air', atmosphere: 'tense' } },
    });
    const fetched = await resolvers.Query.story(null, { id: String(s._id) }, ctx(ALICE));
    expect(resolvers.Story.id(fetched)).toBe(String(s._id));
    expect(resolvers.Story.currentLocation(fetched)).toMatchObject({ name: 'Harbour' });

    // Mongoose materialises the nested subdocument, so a story with no
    // location yields an empty object rather than a name.
    const bare = await makeStory({ title: 'No location' });
    expect(resolvers.Story.currentLocation(bare)?.name).toBeUndefined();
  });
});
