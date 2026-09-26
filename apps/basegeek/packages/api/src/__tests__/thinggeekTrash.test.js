/**
 * thinggeekTrash.test.js — soft delete (insurance records must survive an
 * accidental delete). deleteThing sets deletedAt; the thing then vanishes
 * from every normal read — list, search, thing(id), facets, attention,
 * totals, counts, relationships — and appears in trashedThings (newest
 * first) until restoreThing brings it back. Purging is the backend's job.
 *
 * Also here: saved views on the caller's profile, and the vocabulary.
 */
import constantsModule from '@geeksuite/schemas/thinggeek/constants';
import {
  startHarness,
  stopHarness,
  cleanAll,
  ok,
  errorCode,
  starterTypes,
  createThing,
  createPlace,
  names,
  dayFromToday,
  Thing,
  ThingProfile,
  CHEF,
  HEATHER,
  UPDATE_THING,
} from './thinggeekHarness.js';

const { TRASH_DAYS, MISSING_KEYS } = constantsModule;

beforeAll(startHarness, 60000);
beforeEach(cleanAll);
afterAll(async () => {
  await cleanAll();
  await stopHarness();
});

const DELETE = `mutation($id: ID!) { deleteThing(id: $id) { success message } }`;
const RESTORE = `mutation($id: ID!) { restoreThing(id: $id) { id name deletedAt } }`;
const TRASH = `query { trashedThings { id name deletedAt } }`;

describe('soft delete', () => {
  test('a deleted thing is excluded everywhere, listed in Trash, and restorable', async () => {
    const types = await starterTypes();
    const garage = await createPlace('Garage');
    const keep = await createThing({ name: 'Keep', typeId: types.tool.id, placeId: garage.id, tags: ['t'], value: { amount: 10 } });
    const gone = await createThing({
      name: 'Gone', typeId: types.tool.id, placeId: garage.id, tags: ['t'], value: { amount: 99 },
      dates: [{ kind: 'warranty', date: dayFromToday(-1) }], relationships: [{ kind: 'stored-with', thingId: keep.id }],
    });

    const res = (await ok(DELETE, { id: gone.id })).deleteThing;
    expect(res).toEqual({ success: true, message: `Moved to Trash for ${TRASH_DAYS} days` });
    expect((await Thing.findById(gone.id).lean()).deletedAt).toBeInstanceOf(Date);

    expect(await names()).toEqual(['Keep']);
    expect(await names({ q: 'gone' })).toEqual([]);
    expect((await ok(`query($id: ID!) { thing(id: $id) { id } }`, { id: gone.id })).thing).toBeNull();
    const f = (await ok(`query { thingFacets { total tags { value count } due { value count } } }`)).thingFacets;
    expect(f.total).toBe(1);
    expect(f.tags).toEqual([{ value: 't', count: 1 }]);
    expect(f.due[0]).toEqual({ value: 'overdue', count: 0 });
    expect((await ok(`query { thingAttention { overdue { name } missingPhoto } }`)).thingAttention).toEqual({ overdue: [], missingPhoto: 1 });
    expect((await ok(`query { thingInsuranceTotals { count totalValue } }`)).thingInsuranceTotals).toEqual({ count: 1, totalValue: 10 });
    expect((await ok(`query { places { directCount totalCount } }`)).places).toEqual([{ directCount: 1, totalCount: 1 }]);
    expect((await ok(`query { thingTypes { key thingCount } }`)).thingTypes.find((t) => t.key === 'tool').thingCount).toBe(1);
    // Its stored relationship no longer shows as an inverse on Keep.
    expect((await ok(`query($id: ID!) { thing(id: $id) { relationships { id } } }`, { id: keep.id })).thing.relationships).toEqual([]);
    // Not editable while trashed; deleting again is a no-op.
    expect(await errorCode(UPDATE_THING, { id: gone.id, input: { name: 'x' } })).toBe('NOT_FOUND');
    expect((await ok(DELETE, { id: gone.id })).deleteThing.success).toBe(false);

    const trash = (await ok(TRASH)).trashedThings;
    expect(trash).toEqual([{ id: gone.id, name: 'Gone', deletedAt: expect.any(String) }]);

    const restored = (await ok(RESTORE, { id: gone.id })).restoreThing;
    expect(restored).toEqual({ id: gone.id, name: 'Gone', deletedAt: null });
    expect(await names()).toEqual(['Gone', 'Keep']);
    expect((await ok(TRASH)).trashedThings).toEqual([]);
    expect((await ok(`query($id: ID!) { thing(id: $id) { relationships { direction } } }`, { id: keep.id })).thing.relationships).toEqual([
      { direction: 'in' },
    ]);
  });

  test('trashedThings is newest first; restore refuses a live or unknown thing', async () => {
    const a = await createThing({ name: 'A' });
    const b = await createThing({ name: 'B' });
    const c = await createThing({ name: 'C' });
    await ok(DELETE, { id: b.id });
    await Thing.updateOne({ _id: b.id }, { $set: { deletedAt: new Date(Date.now() - 60000) } });
    await ok(DELETE, { id: a.id });
    expect((await ok(TRASH)).trashedThings.map((t) => t.name)).toEqual(['A', 'B']);
    expect(await errorCode(RESTORE, { id: c.id })).toBe('NOT_FOUND');
    expect(await errorCode(RESTORE, { id: 'nope' })).toBe('NOT_FOUND');
    expect((await ok(DELETE, { id: 'nope' })).deleteThing.success).toBe(false);
  });

  test('a relationship to a trashed thing cannot be created', async () => {
    const a = await createThing({ name: 'A' });
    const b = await createThing({ name: 'B' });
    await ok(DELETE, { id: b.id });
    expect(await errorCode(UPDATE_THING, { id: a.id, input: { relationships: [{ kind: 'part-of', thingId: b.id }] } })).toBe('BAD_USER_INPUT');
  });
});

describe('saved views', () => {
  const SAVE = `mutation($input: ThingSavedFilterInput!) { saveThingFilter(input: $input) { savedFilters { id name filter sortBy sortDir } } }`;
  const DEL = `mutation($id: ID!) { deleteThingFilter(id: $id) { savedFilters { id } } }`;

  test('saved on the caller’s profile, validated with the filter schema, editable and deletable', async () => {
    const saved = (await ok(SAVE, { input: { name: 'Guns', filter: { q: 'type:firearm', missing: ['receipt'] }, sortBy: 'value', sortDir: 'desc' } })).saveThingFilter;
    expect(saved.savedFilters).toEqual([
      { id: expect.any(String), name: 'Guns', filter: { q: 'type:firearm', missing: ['receipt'] }, sortBy: 'value', sortDir: 'desc' },
    ]);
    const id = saved.savedFilters[0].id;
    const edited = (await ok(SAVE, { input: { id, name: 'Firearms' } })).saveThingFilter.savedFilters;
    expect(edited).toEqual([{ id, name: 'Firearms', filter: {}, sortBy: 'name', sortDir: 'asc' }]);
    // Heather has her own.
    expect((await ok(`query { thingProfile { savedFilters { id } } }`, {}, HEATHER)).thingProfile.savedFilters).toEqual([]);
    expect((await ok(DEL, { id })).deleteThingFilter.savedFilters).toEqual([]);
    expect(await ThingProfile.countDocuments({ userId: CHEF })).toBe(1);
  });

  test('bad filters, sorts and unknown ids are rejected', async () => {
    expect(await errorCode(SAVE, { input: { name: 'x', filter: { due: ['someday'] } } })).toBe('BAD_USER_INPUT');
    expect(await errorCode(SAVE, { input: { name: 'x', filter: { householdId: 'other' } } })).toBe('BAD_USER_INPUT');
    expect(await errorCode(SAVE, { input: { name: 'x', sortBy: 'price' } })).toBe('BAD_USER_INPUT');
    expect(await errorCode(SAVE, { input: { name: '  ' } })).toBe('BAD_USER_INPUT');
    expect(await errorCode(SAVE, { input: { id: 'missing', name: 'x' } })).toBe('NOT_FOUND');
  });
});

test('thingVocabulary returns the shared constants', async () => {
  const v = (await ok(`query { thingVocabulary { fieldKinds dateKinds photoRoles documentRoles relationshipKinds missingKeys trashDays } }`)).thingVocabulary;
  expect(v.missingKeys).toEqual([...MISSING_KEYS]);
  expect(v.trashDays).toBe(TRASH_DAYS);
  expect(v.fieldKinds).toContain('money');
  expect(v.relationshipKinds).toEqual(['equipped-with', 'part-of', 'accessory-of', 'stored-with']);
});
