/**
 * goingOverGateway.test.js — pinning tests for the gateway half of the
 * 2026-09-05 going-over.
 *
 * One file, because these are one pass's findings and they share a fixture
 * cost (the in-memory Mongo connections each gateway model opens). Each
 * `describe` names the bug it pins; every case is written so it FAILS against
 * the code as it stood before the fix, not merely passes against the code as
 * it stands now.
 */

import mongoose from 'mongoose';

const { default: HatchEvent } = await import('../graphql/flockgeek/models/HatchEvent.js');
const { default: Pairing } = await import('../graphql/flockgeek/models/Pairing.js');
const { default: EggProduction } = await import('../graphql/flockgeek/models/EggProduction.js');
const { default: Group } = await import('../graphql/flockgeek/models/Group.js');
const { resolvers: flockResolvers } = await import('../graphql/flockgeek/resolvers.js');

const { Book } = await import('../graphql/bookgeek/models/book.js');
const { resolvers: bookResolvers } = await import('../graphql/bookgeek/resolvers.js');

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { resolvers: noteResolvers } = await import('../graphql/notegeek/resolvers.js');
const { updateNoteArgsSchema, createNoteArgsSchema } = await import('../graphql/notegeek/validation.js');

const { default: TaskOrder } = await import('../graphql/bujogeek/models/TaskOrder.js');
const { default: taskService } = await import('../graphql/bujogeek/services/taskService.js');

const {
  updateFlockGroupArgsSchema,
  updateEggProductionArgsSchema,
  updateHatchEventArgsSchema,
} = await import('../graphql/flockgeek/validation.js');

const ALICE = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: userId } } : {});

beforeAll(async () => {
  await HatchEvent.db.asPromise();
  await Book.db.asPromise();
  await Note.db.asPromise();
  await TaskOrder.db.asPromise();
}, 60000);

afterEach(async () => {
  await Promise.all(
    [HatchEvent, Pairing, EggProduction, Group, Book, Note, TaskOrder].map((m) => m.deleteMany({}))
  );
});

afterAll(async () => {
  await Promise.all([HatchEvent.db.close(), Book.db.close(), Note.db.close(), TaskOrder.db.close()]);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// ───────────────────────────────────────────────────────────────────────────
describe('recordHatchEvent no longer fails on a required pairingId nobody sends', () => {
  // The mutation never accepted a pairingId — not in typeDefs, not in
  // validation.js, and the Add dialog has no pairing selector — while the
  // model declared it `required: true`. So `.save()` failed the required-path
  // validator on EVERY create and no hatch event could be logged at all.
  test('a hatch event with no pairing saves', async () => {
    const event = await flockResolvers.Mutation.recordHatchEvent(
      null,
      { setDate: '2026-03-01', eggsSet: 12, notes: 'incubator A' },
      ctx(ALICE)
    );
    expect(String(event.ownerId)).toBe(ALICE);
    expect(event.eggsSet).toBe(12);
    expect(event.pairingId ?? null).toBeNull();
    expect(await HatchEvent.countDocuments({ ownerId: ALICE })).toBe(1);
  });

  test('a pairing the caller owns is accepted and stored', async () => {
    const pairing = await Pairing.create({ ownerId: ALICE, name: 'Blue x Rusty' });
    const event = await flockResolvers.Mutation.recordHatchEvent(
      null,
      { setDate: '2026-03-01', eggsSet: 6, pairingId: String(pairing._id) },
      ctx(ALICE)
    );
    expect(String(event.pairingId)).toBe(String(pairing._id));
  });

  test("another owner's pairing is refused, and nothing is written", async () => {
    const foreign = await Pairing.create({ ownerId: String(new mongoose.Types.ObjectId()), name: 'Not yours' });
    await expect(
      flockResolvers.Mutation.recordHatchEvent(
        null,
        { setDate: '2026-03-01', eggsSet: 6, pairingId: String(foreign._id) },
        ctx(ALICE)
      )
    ).rejects.toThrow(/not found/i);
    expect(await HatchEvent.countDocuments({})).toBe(0);
  });

  test("an empty-string pairingId means 'none', not an ObjectId cast error", async () => {
    const event = await flockResolvers.Mutation.recordHatchEvent(
      null,
      { setDate: '2026-03-01', eggsSet: 3, pairingId: '' },
      ctx(ALICE)
    );
    expect(event.pairingId ?? null).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('null cannot be written into a GraphQL non-null field', () => {
  // The update resolvers `$set` their input with no `runValidators`, so an
  // accepted null lands in the document and every LATER query on that
  // collection then fails the non-null check for the whole list.
  const rejectsNull = (schema, args, field) => {
    const result = schema.safeParse(args);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path[0] === field)).toBe(true);
  };

  test('FlockGroup.startDate is Date! — null is refused, omitted is fine', () => {
    rejectsNull(updateFlockGroupArgsSchema, { id: 'x', startDate: null }, 'startDate');
    expect(updateFlockGroupArgsSchema.safeParse({ id: 'x', name: 'Layers' }).success).toBe(true);
    // endDate IS nullable in the schema and must stay clearable.
    expect(updateFlockGroupArgsSchema.safeParse({ id: 'x', endDate: null }).success).toBe(true);
  });

  test('EggProduction.date and .eggsCount are non-null — null is refused', () => {
    rejectsNull(updateEggProductionArgsSchema, { id: 'x', date: null }, 'date');
    rejectsNull(updateEggProductionArgsSchema, { id: 'x', eggsCount: null }, 'eggsCount');
    expect(updateEggProductionArgsSchema.safeParse({ id: 'x', eggsCount: 4 }).success).toBe(true);
  });

  test('HatchEvent.setDate is Date! but hatchDate is not', () => {
    rejectsNull(updateHatchEventArgsSchema, { id: 'x', setDate: null }, 'setDate');
    expect(updateHatchEventArgsSchema.safeParse({ id: 'x', hatchDate: null }).success).toBe(true);
  });

  test('updateNote refuses content: null and tags: null (String! / [String!]!)', () => {
    rejectsNull(updateNoteArgsSchema, { id: 'x', content: null }, 'content');
    rejectsNull(updateNoteArgsSchema, { id: 'x', tags: null }, 'tags');
    // Emptying is still possible; only the null is refused.
    expect(updateNoteArgsSchema.safeParse({ id: 'x', content: '', tags: [] }).success).toBe(true);
  });

  test("createNote's tags argument IS nullable in the schema and stays so", () => {
    // Guards against over-correcting: `createNote(tags: [String!])` accepts
    // null by declaration, so rejecting it here would be a new 400.
    expect(createNoteArgsSchema.safeParse({ content: 'hi', tags: null }).success).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('client search text cannot break, or hang, a query', () => {
  test('a book title containing regex metacharacters searches literally', async () => {
    await Book.create({ title: 'Dune (Deluxe Edition)', authors: ['Frank Herbert'] });
    await Book.create({ title: 'Learning C++', authors: ['Nobody'] });
    await Book.create({ title: 'Neuromancer', authors: ['William Gibson'] });

    // Before the fix each of these threw out of mongod ("Unterminated group",
    // "Nothing to repeat") and the library page rendered an error.
    const deluxe = await bookResolvers.Query.books(null, { q: 'Dune (Deluxe' }, ctx(ALICE));
    expect(deluxe.items.map((b) => b.title)).toEqual(['Dune (Deluxe Edition)']);

    const cpp = await bookResolvers.Query.books(null, { q: 'C++' }, ctx(ALICE));
    expect(cpp.items.map((b) => b.title)).toEqual(['Learning C++']);

    // And a metacharacter is no longer a wildcard: '.' matches only a literal
    // dot, so this finds nothing rather than everything.
    const dot = await bookResolvers.Query.books(null, { q: 'Dune .Deluxe' }, ctx(ALICE));
    expect(dot.items).toHaveLength(0);
  });

  test('an author search escapes too', async () => {
    await Book.create({ title: 'Anything', authors: ['A. (Tony) Author'] });
    const hit = await bookResolvers.Query.books(null, { author: 'A. (Tony)' }, ctx(ALICE));
    expect(hit.items).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('notes(tag:, prefix:) narrows on both, instead of dropping one', () => {
  test('sending both arguments matches only notes carrying both', async () => {
    await Note.create({ userId: ALICE, title: 'both', content: 'x', tags: ['flock', 'chores/feed'] });
    await Note.create({ userId: ALICE, title: 'prefix only', content: 'x', tags: ['chores/water'] });
    await Note.create({ userId: ALICE, title: 'tag only', content: 'x', tags: ['flock'] });

    const both = await noteResolvers.Query.notes(null, { tag: 'flock', prefix: 'chores/' }, ctx(ALICE));
    expect(both.map((n) => n.title)).toEqual(['both']);

    // Each argument alone still behaves exactly as it did.
    const tagOnly = await noteResolvers.Query.notes(null, { tag: 'flock' }, ctx(ALICE));
    expect(tagOnly.map((n) => n.title).sort()).toEqual(['both', 'tag only']);
    const prefixOnly = await noteResolvers.Query.notes(null, { prefix: 'chores/' }, ctx(ALICE));
    expect(prefixOnly.map((n) => n.title).sort()).toEqual(['both', 'prefix only']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('saveDailyOrder survives a day containing a recurring task', () => {
  // The rendered day contains synthetic ids (`virtual_<masterId>_<epochMs>`)
  // and the drag handlers post the list verbatim. `orderedTaskIds` is
  // `[ObjectId]`, and ONE bad element fails the whole array cast — so the
  // mutation 500'd and the ordinary tasks' order was lost with it.
  test('virtual occurrence ids are dropped, real ids are kept in order', async () => {
    const realA = String(new mongoose.Types.ObjectId());
    const realB = String(new mongoose.Types.ObjectId());
    const doc = await taskService.saveDailyOrder({
      userId: ALICE,
      dateKey: '2026-09-05',
      orderedTaskIds: [realA, `virtual_${new mongoose.Types.ObjectId()}_1757030400000`, realB],
    });
    expect(doc.orderedTaskIds.map(String)).toEqual([realA, realB]);
  });

  test('an all-virtual day saves an empty order rather than throwing', async () => {
    const doc = await taskService.saveDailyOrder({
      userId: ALICE,
      dateKey: '2026-09-06',
      orderedTaskIds: [`virtual_${new mongoose.Types.ObjectId()}_1757116800000`],
    });
    expect(doc.orderedTaskIds).toEqual([]);
  });
});
