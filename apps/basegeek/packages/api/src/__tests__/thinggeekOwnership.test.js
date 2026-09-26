/**
 * thinggeekOwnership.test.js — the gate and the tenant boundary.
 *
 * ThingGeek holds firearms and their serials (DOCS/THINGGEEK_PLAN.md):
 *   1. Every query and mutation requires a signed-in user (Unauthorized).
 *   2. A signed-in NON-member gets NOT_A_MEMBER from every one of them —
 *      before validation, before any read — and nothing changes.
 *   3. Field resolvers gate too (a Thing handed to a field resolver with a
 *      non-member context still refuses).
 *   4. Another household's things, types, places and files are never
 *      visible, countable, editable or relatable.
 */
import mongoose from 'mongoose';
import {
  startHarness,
  stopHarness,
  cleanAll,
  ok,
  run,
  errorCode,
  starterTypes,
  createThing,
  createPlace,
  insertFile,
  attach,
  names,
  Thing,
  ThingType,
  Place,
  ThingProfile,
  thingResolvers,
  ctx,
  CHEF,
  HEATHER,
  OUTSIDER,
  OTHER_HOUSEHOLD,
  THING_FIELDS,
  THINGS,
} from './thinggeekHarness.js';

const { Query, Mutation } = thingResolvers;

beforeAll(startHarness, 60000);
beforeEach(cleanAll);
afterAll(async () => {
  await cleanAll();
  await stopHarness();
});

/** One call per root resolver, for `userId` (null = anonymous). */
function everyCall(userId, ids) {
  const c = ctx(userId);
  const { thingId, typeId, placeId } = ids;
  const queryCalls = {
    things: () => Query.things(null, {}, c),
    thing: () => Query.thing(null, { id: thingId }, c),
    thingFacets: () => Query.thingFacets(null, {}, c),
    thingTypes: () => Query.thingTypes(null, {}, c),
    places: () => Query.places(null, {}, c),
    thingAttention: () => Query.thingAttention(null, {}, c),
    thingProfile: () => Query.thingProfile(null, {}, c),
    thingVocabulary: () => Query.thingVocabulary(null, {}, c),
    trashedThings: () => Query.trashedThings(null, {}, c),
    thingInsuranceTotals: () => Query.thingInsuranceTotals(null, {}, c),
  };
  const mutationCalls = {
    createThing: () => Mutation.createThing(null, { input: { name: 'x' } }, c),
    updateThing: () => Mutation.updateThing(null, { id: thingId, input: { name: 'pwned' } }, c),
    deleteThing: () => Mutation.deleteThing(null, { id: thingId }, c),
    restoreThing: () => Mutation.restoreThing(null, { id: thingId }, c),
    createThingType: () => Mutation.createThingType(null, { input: { name: 'x' } }, c),
    updateThingType: () => Mutation.updateThingType(null, { id: typeId, input: { name: 'pwned' } }, c),
    deleteThingType: () => Mutation.deleteThingType(null, { id: typeId }, c),
    createPlace: () => Mutation.createPlace(null, { input: { name: 'x' } }, c),
    updatePlace: () => Mutation.updatePlace(null, { id: placeId, input: { name: 'pwned' } }, c),
    deletePlace: () => Mutation.deletePlace(null, { id: placeId }, c),
    saveThingFilter: () => Mutation.saveThingFilter(null, { input: { name: 'x' } }, c),
    deleteThingFilter: () => Mutation.deleteThingFilter(null, { id: 'x' }, c),
  };
  return { queryCalls, mutationCalls };
}

async function seedMine() {
  const types = await starterTypes();
  const place = await createPlace('Garage');
  const thing = await createThing({ name: 'Glock 19', typeId: types.firearm.id, placeId: place.id, attributes: { serial: 'ABC123' } });
  return { thingId: thing.id, typeId: types.general.id, placeId: place.id };
}

async function snapshot() {
  const strip = (rows) => JSON.stringify(rows);
  return strip([
    await Thing.find({}).sort({ _id: 1 }).lean(),
    await ThingType.find({}).sort({ _id: 1 }).lean(),
    await Place.find({}).sort({ _id: 1 }).lean(),
    await ThingProfile.find({}, { savedFilters: 1, userId: 1 }).sort({ _id: 1 }).lean(),
  ]);
}

describe('thinggeek — authentication required', () => {
  test('every query and every mutation rejects an anonymous caller and changes nothing', async () => {
    const ids = await seedMine();
    const before = await snapshot();
    const { queryCalls, mutationCalls } = everyCall(null, ids);
    // Completeness: a new resolver must be added here.
    expect(Object.keys(queryCalls).sort()).toEqual(Object.keys(Query).sort());
    expect(Object.keys(mutationCalls).sort()).toEqual(Object.keys(Mutation).sort());
    for (const [name, call] of [...Object.entries(queryCalls), ...Object.entries(mutationCalls)]) {
      await expect(call()).rejects.toMatchObject({ message: 'Unauthorized', extensions: { code: 'UNAUTHORIZED' } });
      void name;
    }
    // Auth before validation: a garbage payload still says Unauthorized.
    await expect(Mutation.createThing(null, { input: { nope: 1 } }, {})).rejects.toThrow('Unauthorized');
    expect(await snapshot()).toEqual(before);
  });
});

describe('thinggeek — the member gate', () => {
  test('a signed-in non-member gets NOT_A_MEMBER from every query and mutation, and nothing changes', async () => {
    const ids = await seedMine();
    const before = await snapshot();
    const { queryCalls, mutationCalls } = everyCall(OUTSIDER, ids);
    expect(Object.keys(queryCalls).sort()).toEqual(Object.keys(Query).sort());
    expect(Object.keys(mutationCalls).sort()).toEqual(Object.keys(Mutation).sort());
    for (const call of [...Object.values(queryCalls), ...Object.values(mutationCalls)]) {
      await expect(call()).rejects.toMatchObject({ extensions: { code: 'NOT_A_MEMBER' } });
    }
    // Membership before validation.
    await expect(Mutation.createThing(null, { input: { nope: 1 } }, ctx(OUTSIDER))).rejects.toMatchObject({
      extensions: { code: 'NOT_A_MEMBER' },
    });
    expect(await snapshot()).toEqual(before);
    expect(await ThingProfile.countDocuments({ userId: OUTSIDER })).toBe(0);
  });

  test('over the wire too: the error carries extensions.code NOT_A_MEMBER and no data', async () => {
    await seedMine();
    const res = await run(`query { things { total things { name } } }`, {}, OUTSIDER);
    expect(res.errors[0].extensions.code).toBe('NOT_A_MEMBER');
    expect(res.data).toBeNull();
    expect(await errorCode(`query { thingVocabulary { trashDays } }`, {}, OUTSIDER)).toBe('NOT_A_MEMBER');
  });

  test('field resolvers gate as well (a thing handed over with a non-member context)', async () => {
    const ids = await seedMine();
    const raw = await Thing.findById(ids.thingId).lean();
    for (const field of ['type', 'place', 'attributes', 'fields', 'photos', 'coverPhoto', 'documents', 'relationships', 'missing']) {
      await expect(Promise.resolve().then(() => thingResolvers.Thing[field](raw, {}, ctx(OUTSIDER)))).rejects.toMatchObject({
        extensions: { code: 'NOT_A_MEMBER' },
      });
    }
    const type = await ThingType.findOne({ key: 'firearm' }).lean();
    await expect(Promise.resolve().then(() => thingResolvers.ThingType.thingCount(type, {}, ctx(OUTSIDER)))).rejects.toMatchObject({
      extensions: { code: 'NOT_A_MEMBER' },
    });
    const place = await Place.findById(ids.placeId).lean();
    await expect(Promise.resolve().then(() => thingResolvers.Place.totalCount(place, {}, ctx(OUTSIDER)))).rejects.toMatchObject({
      extensions: { code: 'NOT_A_MEMBER' },
    });
  });

  test('both named members are in, and share one household', async () => {
    await seedMine();
    expect(await names({}, {}, CHEF)).toEqual(['Glock 19']);
    expect(await names({}, {}, HEATHER)).toEqual(['Glock 19']);
  });
});

describe('thinggeek — another household is invisible and untouchable', () => {
  let mine;
  let foreign;
  let foreignType;
  let foreignPlace;
  let types;

  beforeEach(async () => {
    types = await starterTypes();
    const garage = await createPlace('Garage');
    mine = await createThing({ name: 'Wendy', typeId: types.boat.id, placeId: garage.id, tags: ['fishing'], value: { amount: 1000 } });

    foreignType = (await ThingType.collection.insertOne({ householdId: OTHER_HOUSEHOLD, key: 'boat', name: 'Boat', fields: [] })).insertedId;
    foreignPlace = (await Place.collection.insertOne({ householdId: OTHER_HOUSEHOLD, name: 'Garage', parentId: null })).insertedId;
    const theirFile = await insertFile({ householdId: OTHER_HOUSEHOLD });
    foreign = (
      await Thing.collection.insertOne({
        householdId: OTHER_HOUSEHOLD,
        name: 'Wendy II',
        sortName: 'wendy ii',
        typeId: foreignType,
        placeId: foreignPlace,
        tags: ['fishing'],
        value: { amount: 99999, currency: 'USD' },
        attributes: { serial: 'THEIRS' },
        photos: [{ _id: new mongoose.Types.ObjectId(), fileId: theirFile._id, role: 'overview' }],
        documents: [],
        dates: [{ _id: new mongoose.Types.ObjectId(), kind: 'warranty', date: new Date() }],
        // Points at MY thing: must not appear as an inverse relationship.
        relationships: [{ _id: new mongoose.Types.ObjectId(), kind: 'equipped-with', thingId: new mongoose.Types.ObjectId(mine.id) }],
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).insertedId;
    // A trashed foreign thing must not show in MY trash either.
    await Thing.collection.insertOne({ householdId: OTHER_HOUSEHOLD, name: 'Their trash', sortName: 'their trash', deletedAt: new Date() });
  });

  test('not listed, counted, searched, faceted, totalled or flagged', async () => {
    expect(await names()).toEqual(['Wendy']);
    for (const q of ['Wendy', 'THEIRS', 'tag:fishing', 'type:boat', 'in:garage', 'due:30d']) {
      const got = await names({ q });
      expect(got).not.toContain('Wendy II');
    }
    const facets = (await ok(`query { thingFacets { total tags { value count } types { value count } places { value count } due { value count } } }`)).thingFacets;
    expect(facets.total).toBe(1);
    expect(facets.tags).toEqual([{ value: 'fishing', count: 1 }]);
    expect(facets.types.map((t) => t.value)).not.toContain(String(foreignType));
    expect(facets.places.map((p) => p.value)).not.toContain(String(foreignPlace));
    expect(facets.due.find((d) => d.value === '30d').count).toBe(0);

    const totals = (await ok(`query { thingInsuranceTotals { count totalValue } }`)).thingInsuranceTotals;
    expect(totals).toEqual({ count: 1, totalValue: 1000 });
    const attention = (await ok(`query { thingAttention { dueSoon { name } missingPhoto } }`)).thingAttention;
    expect(attention.dueSoon).toEqual([]);
    expect(attention.missingPhoto).toBe(1);
    expect((await ok(`query { trashedThings { name } }`)).trashedThings).toEqual([]);
    expect((await ok(`query { places { name } }`)).places.map((p) => p.name)).toEqual(['Garage']);
    // A foreign place id as a filter matches nothing (not their things, not mine).
    expect(await names({ places: [String(foreignPlace)] })).toEqual([]);
    expect(await names({ types: [String(foreignType)] })).toEqual([]);
  });

  test('thing(id) is null; relationships from the foreign thing do not surface', async () => {
    expect((await ok(`query($id: ID!) { thing(id: $id) { id } }`, { id: String(foreign) })).thing).toBeNull();
    const t = (await ok(`query($id: ID!) { thing(id: $id) { ${THING_FIELDS} } }`, { id: mine.id })).thing;
    expect(t.relationships).toEqual([]);
  });

  test('update, delete and restore refuse the foreign thing and change nothing', async () => {
    const before = await Thing.collection.findOne({ _id: foreign });
    const id = String(foreign);
    expect(await errorCode(`mutation($id: ID!) { updateThing(id: $id, input: { name: "pwned" }) { id } }`, { id })).toBe('NOT_FOUND');
    expect((await ok(`mutation($id: ID!) { deleteThing(id: $id) { success } }`, { id })).deleteThing.success).toBe(false);
    await Thing.collection.updateOne({ householdId: OTHER_HOUSEHOLD, name: 'Their trash' }, { $set: {} });
    const trashId = String((await Thing.collection.findOne({ name: 'Their trash' }))._id);
    expect(await errorCode(`mutation($id: ID!) { restoreThing(id: $id) { id } }`, { id: trashId })).toBe('NOT_FOUND');
    expect(await Thing.collection.findOne({ _id: foreign })).toEqual(before);
    expect((await Thing.collection.findOne({ name: 'Their trash' })).deletedAt).toBeInstanceOf(Date);
  });

  test('a foreign thing, type or place cannot be referenced', async () => {
    const UPDATE = `mutation($id: ID!, $input: ThingInput!) { updateThing(id: $id, input: $input) { id } }`;
    expect(await errorCode(UPDATE, { id: mine.id, input: { relationships: [{ kind: 'stored-with', thingId: String(foreign) }] } })).toBe(
      'BAD_USER_INPUT'
    );
    expect(await errorCode(UPDATE, { id: mine.id, input: { typeId: String(foreignType) } })).toBe('BAD_USER_INPUT');
    expect(await errorCode(UPDATE, { id: mine.id, input: { placeId: String(foreignPlace) } })).toBe('BAD_USER_INPUT');
    expect(await errorCode(`mutation($input: PlaceInput!) { createPlace(input: $input) { id } }`, { input: { name: 'x', parentId: String(foreignPlace) } })).toBe(
      'BAD_USER_INPUT'
    );
    expect(await errorCode(`mutation($id: ID!) { updatePlace(id: $id, input: { name: "pwned" }) { id } }`, { id: String(foreignPlace) })).toBe(
      'NOT_FOUND'
    );
    expect((await ok(`mutation($id: ID!) { deletePlace(id: $id) { success } }`, { id: String(foreignPlace) })).deletePlace.success).toBe(false);
    expect(await Place.collection.countDocuments({ householdId: OTHER_HOUSEHOLD })).toBe(1);
    // Deleting MY garage leaves their thing's placeId alone.
    const myGarage = (await ok(`query { places { id } }`)).places[0].id;
    await ok(`mutation($id: ID!) { deletePlace(id: $id) { success } }`, { id: myGarage });
    expect(String((await Thing.collection.findOne({ _id: foreign })).placeId)).toBe(String(foreignPlace));
  });

  test("another household's file record never lends metadata to my photo", async () => {
    const theirFile = await insertFile({ householdId: OTHER_HOUSEHOLD });
    await attach(mine.id, { photos: [{ fileId: theirFile._id }] });
    const t = (await ok(`query($id: ID!) { thing(id: $id) { photos { url thumbUrl width } } }`, { id: mine.id })).thing;
    expect(t.photos).toEqual([{ url: `/api/files/${theirFile._id}`, thumbUrl: null, width: null }]);
  });

  test('a smuggled householdId in input is a rejection', async () => {
    expect(await errorCode(`mutation($input: ThingInput!) { createThing(input: $input) { id } }`, { input: { name: 'x', householdId: 'other-household' } })).toBeTruthy();
    await expect(Mutation.createThing(null, { input: { name: 'x', householdId: OTHER_HOUSEHOLD } }, ctx(CHEF))).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(await Thing.countDocuments({ householdId: OTHER_HOUSEHOLD })).toBe(2);
  });
});
