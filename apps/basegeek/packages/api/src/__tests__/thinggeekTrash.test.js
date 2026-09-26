/**
 * thinggeekTrash.test.js — soft delete (insurance records must survive an
 * accidental delete). deleteThing sets deletedAt; the thing then vanishes
 * from every normal read — list, search, thing(id), facets, attention,
 * totals, counts, relationships — and appears in trashedThings (newest
 * first) until restoreThing brings it back. Purging is the backend's job.
 * What is INSIDE a trashed thing stays put: it shows the trashed ancestor in
 * its path (inTrash), and restoring brings the path back.
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
  createLocation,
  move,
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
const CREATE_THING_Q = `mutation($input: ThingInput!) { createThing(input: $input) { id } }`;

describe('soft delete', () => {
  test('a deleted thing is excluded everywhere, listed in Trash, and restorable', async () => {
    const types = await starterTypes();
    const garage = await createLocation('Garage');
    const keep = await createThing({ name: 'Keep', typeId: types.tool.id, parentId: garage.id, tags: ['t'], value: { amount: 10 } });
    const gone = await createThing({
      name: 'Gone', typeId: types.tool.id, parentId: garage.id, tags: ['t'], value: { amount: 99 },
      dates: [{ kind: 'warranty', date: dayFromToday(-1) }], relationships: [{ kind: 'accessory-of', thingId: keep.id }],
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
    expect((await ok(`query { thingTree { name childCount itemCount } }`)).thingTree).toEqual([
      { name: 'Garage', childCount: 1, itemCount: 1 },
      { name: 'Keep', childCount: 0, itemCount: 0 },
    ]);
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
    expect(await errorCode(UPDATE_THING, { id: a.id, input: { relationships: [{ kind: 'accessory-of', thingId: b.id }] } })).toBe('BAD_USER_INPUT');
  });
});

describe('trash and containment', () => {
  const PATH = `query($id: ID!) { thing(id: $id) { path { name inTrash } } }`;

  test('trashing a container leaves its contents in place, inside something in the Trash; restore brings the path back', async () => {
    const types = await starterTypes();
    const house = await createLocation('House');
    const garage = await createLocation('Garage', house.id);
    const van = await createThing({ name: 'Van', typeId: types.vehicle.id, parentId: garage.id });
    const cables = await createThing({ name: 'Jumper cables', typeId: types.tool.id, parentId: van.id });
    await ok(DELETE, { id: van.id });

    // Still in the Van: the path shows it, flagged.
    expect((await Thing.findById(cables.id).lean()).parentId.toString()).toBe(van.id);
    expect((await ok(PATH, { id: cables.id })).thing.path).toEqual([
      { name: 'House', inTrash: false },
      { name: 'Garage', inTrash: false },
      { name: 'Van', inTrash: true },
    ]);
    // Still found "in the garage" (it is), and counted there, through the trashed Van.
    expect(await names({ q: 'in:garage' })).toEqual(['Jumper cables']);
    const tree = (await ok(`query { thingTree { name parentInTrash itemCount } }`)).thingTree;
    expect(tree).toEqual([
      { name: 'House', parentInTrash: false, itemCount: 1 },
      { name: 'Garage', parentInTrash: false, itemCount: 1 },
      { name: 'Jumper cables', parentInTrash: true, itemCount: 0 },
    ]);
    // The Van cannot receive anything while trashed…
    const res = await move(cables.id, van.id);
    expect(res.errors[0].extensions).toMatchObject({ code: 'BAD_USER_INPUT', details: [{ path: 'input.parentId', message: 'that thing is in the Trash' }] });
    expect(await errorCode(CREATE_THING_Q, { input: { name: 'Flares', parentId: van.id } })).toBe('BAD_USER_INPUT');

    await ok(RESTORE, { id: van.id });
    expect((await ok(PATH, { id: cables.id })).thing.path).toEqual([
      { name: 'House', inTrash: false },
      { name: 'Garage', inTrash: false },
      { name: 'Van', inTrash: false },
    ]);
    // …and can again once restored.
    expect((await move(cables.id, van.id)).errors).toBeNull();
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
  const v = (await ok(`query { thingVocabulary { fieldKinds dateKinds photoRoles documentRoles relationshipKinds thingKinds missingKeys trashDays } }`)).thingVocabulary;
  expect(v.missingKeys).toEqual([...MISSING_KEYS]);
  expect(v.trashDays).toBe(TRASH_DAYS);
  expect(v.fieldKinds).toContain('money');
  // Location is parentId only (DOCS/THINGGEEK_PLAN.md "Containment").
  expect(v.relationshipKinds).toEqual(['accessory-of']);
  expect(v.thingKinds).toEqual(['location', 'container', 'item']);
});
