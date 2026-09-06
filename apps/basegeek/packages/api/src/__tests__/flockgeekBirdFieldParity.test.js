/**
 * flockgeekBirdFieldParity.test.js
 *
 * Q59. `updateBird` used to declare six of the sixteen fields BirdsPage's edit
 * form collects — name, tagId, status, notes, locationId, sex — so Breed,
 * Hatch Date, Species, Strain, Cross, Origin, Foundation Stock, Temperament,
 * Status Date and Status Reason were editable inputs that saved nothing. The
 * dialog closed, Apollo reported success, and the bird was unchanged.
 *
 * That is not a bug a frontend test can catch: both sides of a frontend test
 * are the client. It needs the resolver, so this suite drives the real
 * `Mutation.updateBird` against real Mongo and reads the document back.
 *
 * Three guards, and the parity ones are the ones that keep it fixed:
 *   1. A full-field update round-trips — every field the form collects is
 *      written and reads back.
 *   2. `createBird` and `updateBird` declare the SAME bird field list in
 *      typeDefs. They are supposed to differ only by `id` and by whether
 *      `tagId` is required; drifting apart is what caused Q59.
 *   3. Every GraphQL argument has a key in the zod schema and vice versa — so
 *      a field added to one layer and forgotten in the other fails here rather
 *      than becoming the next silent discard. (A GraphQL argument with no zod
 *      key is rejected by `.strict()` at runtime; a zod key with no GraphQL
 *      argument is simply unreachable.)
 */

import mongoose from 'mongoose';

const { default: Bird } = await import('../graphql/flockgeek/models/Bird.js');
const { default: Location } = await import('../graphql/flockgeek/models/Location.js');
const { resolvers } = await import('../graphql/flockgeek/resolvers.js');
const { typeDefs } = await import('../graphql/flockgeek/typeDefs.js');
const { createBirdArgsSchema, updateBirdArgsSchema } = await import(
  '../graphql/flockgeek/validation.js'
);

const ALICE = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: userId } } : {});
const { Mutation, Query } = resolvers;

/** The argument names of a root field, straight out of the parsed SDL. */
function argumentNames(fieldName) {
  for (const def of typeDefs.definitions) {
    if (def.kind !== 'ObjectTypeDefinition' || def.name.value !== 'Mutation') continue;
    const field = def.fields.find((f) => f.name.value === fieldName);
    if (field) return field.arguments.map((a) => a.name.value);
  }
  throw new Error(`Mutation.${fieldName} not found in flockgeek typeDefs`);
}

beforeAll(async () => {
  await Bird.db.asPromise();
}, 60000);

afterEach(async () => {
  await Promise.all([Bird.deleteMany({}), Location.deleteMany({})]);
});

afterAll(async () => {
  await Bird.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('updateBird round-trips every field the edit form collects', () => {
  test('all sixteen fields are written and read back', async () => {
    const location = await Location.create({ ownerId: ALICE, name: 'Tractor 1', type: 'tractor' });
    const bird = await Bird.create({ ownerId: ALICE, tagId: 'A-001', name: 'Henrietta' });

    // Exactly the payload BirdsPage's handleSaveEdit now builds.
    const input = {
      id: String(bird._id),
      tagId: 'A-002',
      name: 'Hennifer',
      species: 'duck',
      breed: 'Ancona',
      strain: 'Holderread',
      cross: true,
      sex: 'hen',
      hatchDate: '2026-03-14',
      origin: 'purchased',
      foundationStock: true,
      locationId: String(location._id),
      temperamentScore: 7,
      status: 'retired',
      statusDate: '2026-08-01',
      statusReason: 'Stopped laying',
      notes: 'Broody every spring.',
    };

    await Mutation.updateBird(null, input, ctx(ALICE));

    const saved = await Query.bird(null, { id: String(bird._id) }, ctx(ALICE));
    expect(saved.tagId).toBe('A-002');
    expect(saved.name).toBe('Hennifer');
    expect(saved.species).toBe('duck');
    expect(saved.breed).toBe('Ancona');
    expect(saved.strain).toBe('Holderread');
    expect(saved.cross).toBe(true);
    expect(saved.sex).toBe('hen');
    expect(saved.origin).toBe('purchased');
    expect(saved.foundationStock).toBe(true);
    expect(String(saved.locationId)).toBe(String(location._id));
    expect(saved.temperamentScore).toBe(7);
    expect(saved.status).toBe('retired');
    expect(saved.statusReason).toBe('Stopped laying');
    expect(saved.notes).toBe('Broody every spring.');

    // Both dates are calendar days and normalize to UTC midnight — the
    // module-wide flockgeek contract, not a per-field choice.
    expect(saved.hatchDate.toISOString()).toBe('2026-03-14T00:00:00.000Z');
    expect(saved.statusDate.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  test('the ten fields Q59 added really were being discarded before it', async () => {
    // The pre-Q59 argument list, as a set. Every one of these is a rendered
    // input on the edit form; if any of them ever falls out of the mutation
    // again, this is the line that says so.
    const before = new Set(['id', 'name', 'tagId', 'status', 'notes', 'locationId', 'sex']);
    const added = argumentNames('updateBird').filter((a) => !before.has(a));
    expect(added.sort()).toEqual([
      'breed',
      'cross',
      'foundationStock',
      'hatchDate',
      'origin',
      'species',
      'statusDate',
      'statusReason',
      'strain',
      'temperamentScore',
    ]);
  });

  test('a partial update still leaves untouched fields alone', async () => {
    const bird = await Bird.create({
      ownerId: ALICE,
      tagId: 'A-003',
      breed: 'Bielefelder',
      strain: 'Greenfire',
      temperamentScore: 9,
    });

    await Mutation.updateBird(null, { id: String(bird._id), name: 'Just a name' }, ctx(ALICE));

    const saved = await Query.bird(null, { id: String(bird._id) }, ctx(ALICE));
    expect(saved.name).toBe('Just a name');
    expect(saved.breed).toBe('Bielefelder');
    expect(saved.strain).toBe('Greenfire');
    expect(saved.temperamentScore).toBe(9);
  });

  test('the widened fields are still validated, not just accepted', async () => {
    const bird = await Bird.create({ ownerId: ALICE, tagId: 'A-004' });
    // `models/Bird.js` calls temperamentScore a 1-10 scale, and a
    // findOneAndUpdate runs with runValidators off, so zod is the only thing
    // that has ever enforced it.
    await expect(
      Mutation.updateBird(null, { id: String(bird._id), temperamentScore: 99 }, ctx(ALICE))
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
    await expect(
      Mutation.updateBird(null, { id: String(bird._id), origin: 'abducted' }, ctx(ALICE))
    ).rejects.toMatchObject({ extensions: { code: 'BAD_USER_INPUT' } });
  });

  test('createBird refuses a location that belongs to someone else', async () => {
    const BOB = String(new mongoose.Types.ObjectId());
    const bobsCoop = await Location.create({ ownerId: BOB, name: 'Bob coop', type: 'coop' });
    await expect(
      Mutation.createBird(null, { tagId: 'A-005', locationId: String(bobsCoop._id) }, ctx(ALICE))
    ).rejects.toThrow(/Location not found/);
  });
});

describe('createBird and updateBird stay in step', () => {
  test('they declare the same bird field list', () => {
    const create = argumentNames('createBird').sort();
    // `id` is update-only; everything else must match exactly.
    const update = argumentNames('updateBird')
      .filter((a) => a !== 'id')
      .sort();
    expect(update).toEqual(create);
  });

  test('every GraphQL argument has a zod key, and every zod key an argument', () => {
    for (const [name, schema] of [
      ['createBird', createBirdArgsSchema],
      ['updateBird', updateBirdArgsSchema],
    ]) {
      const graphqlArgs = argumentNames(name).sort();
      const zodKeys = Object.keys(schema.shape).sort();
      expect({ mutation: name, keys: zodKeys }).toEqual({ mutation: name, keys: graphqlArgs });
    }
  });
});
