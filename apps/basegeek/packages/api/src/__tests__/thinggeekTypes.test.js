/**
 * thinggeekTypes.test.js — starter types and the type editor.
 *
 *   - STARTER_TYPES are seeded once per HOUSEHOLD: idempotent, safe under two
 *     concurrent first calls (the unique {householdId,key} index), recorded
 *     on the caller's profile, and never re-seeded for the second member (a
 *     starter someone deleted stays deleted).
 *   - thingCount excludes trashed things.
 *   - deleteThingType is refused while a live thing uses the type.
 */
import constantsModule from '@geeksuite/schemas/thinggeek/constants';
import {
  startHarness,
  stopHarness,
  cleanAll,
  ok,
  run,
  errorCode,
  starterTypes,
  createThing,
  ThingType,
  ThingProfile,
  thingResolvers,
  ctx,
  CHEF,
  HEATHER,
  TYPES,
} from './thinggeekHarness.js';

const { STARTER_TYPES } = constantsModule;

beforeAll(startHarness, 60000);
beforeEach(cleanAll);
afterAll(async () => {
  await cleanAll();
  await stopHarness();
});

describe('starter types', () => {
  test('first call seeds every starter type, with identifier flags', async () => {
    const types = await starterTypes();
    expect(Object.keys(types).sort()).toEqual(STARTER_TYPES.map((t) => t.key).sort());
    expect(types.firearm.builtIn).toBe(true);
    expect(types.firearm.fields.find((f) => f.key === 'serial')).toMatchObject({ identifier: true, required: false });
    expect(types.firearm.fields.find((f) => f.key === 'kind').choices).toEqual(['Handgun', 'Rifle', 'Shotgun', 'Other']);
    expect(types.general.fields).toEqual([]);
    const profile = await ThingProfile.findOne({ userId: CHEF }).lean();
    expect(profile.starterTypesSeededAt).toBeInstanceOf(Date);
  });

  test('idempotent: a second call adds nothing', async () => {
    await starterTypes();
    await starterTypes();
    expect(await ThingType.countDocuments({ householdId: 'default' })).toBe(STARTER_TYPES.length);
  });

  test('concurrent first calls cannot double-seed', async () => {
    await Promise.all([
      thingResolvers.Query.thingTypes(null, {}, ctx(CHEF)),
      thingResolvers.Query.thingTypes(null, {}, ctx(HEATHER)),
      thingResolvers.Query.thingTypes(null, {}, ctx(CHEF)),
      thingResolvers.Query.thingTypes(null, {}, ctx(HEATHER)),
    ]);
    expect(await ThingType.countDocuments({ householdId: 'default' })).toBe(STARTER_TYPES.length);
  });

  test('once per household: the second member does not resurrect a deleted starter', async () => {
    const types = await starterTypes(CHEF);
    await ok(`mutation($id: ID!) { deleteThingType(id: $id) { success } }`, { id: types.camera.id });
    const heathers = await starterTypes(HEATHER);
    expect(heathers.camera).toBeUndefined();
    expect(await ThingType.countDocuments({ householdId: 'default' })).toBe(STARTER_TYPES.length - 1);
    expect((await ThingProfile.findOne({ userId: HEATHER }).lean()).starterTypesSeededAt).toBeInstanceOf(Date);
  });

  test('seeding one household never touches another', async () => {
    await ThingType.collection.insertOne({ householdId: 'other-household', key: 'boat', name: 'Their Boat', fields: [] });
    const types = await starterTypes();
    expect(types.boat.name).toBe('Boat');
    expect(await ThingType.countDocuments({ householdId: 'other-household' })).toBe(1);
  });
});

describe('thingCount', () => {
  test('counts live things of the type, not trashed ones', async () => {
    const types = await starterTypes();
    const a = await createThing({ name: 'Wendy', typeId: types.boat.id });
    await createThing({ name: 'Skiff', typeId: types.boat.id });
    await ok(`mutation($id: ID!) { deleteThing(id: $id) { success } }`, { id: a.id });
    const again = await starterTypes();
    expect(again.boat.thingCount).toBe(1);
    expect(again.vehicle.thingCount).toBe(0);
  });
});

describe('type editor', () => {
  const CREATE = `mutation($input: ThingTypeInput!) { createThingType(input: $input) { id key name icon builtIn fields { key kind choices identifier required } } }`;
  const UPDATE = `mutation($id: ID!, $input: ThingTypeInput!) { updateThingType(id: $id, input: $input) { id key name fields { key } } }`;
  const DELETE = `mutation($id: ID!) { deleteThingType(id: $id) { success message } }`;

  test('create picks a unique key per household', async () => {
    await starterTypes();
    const t = (await ok(CREATE, { input: { name: 'Boat', fields: [{ key: 'hin', label: 'HIN', kind: 'text', identifier: true }] } })).createThingType;
    expect(t.key).toBe('boat-2');
    expect(t.builtIn).toBe(false);
    expect(t.icon).toBe('Inventory2');
    const u = (await ok(CREATE, { input: { name: 'Bicycle' } })).createThingType;
    expect(u.key).toBe('bicycle');
  });

  test('field shape rules: choice needs choices, keys unique and path-safe, kinds closed', async () => {
    for (const fields of [
      [{ key: 'k', label: 'K', kind: 'choice' }],
      [{ key: 'a', label: 'A', kind: 'text' }, { key: 'a', label: 'A2', kind: 'text' }],
      [{ key: 'a.b', label: 'A', kind: 'text' }],
      [{ key: '$x', label: 'A', kind: 'text' }],
      [{ key: 'a', label: 'A', kind: 'color' }],
    ]) {
      expect(await errorCode(CREATE, { input: { name: 'X', fields } })).toBe('BAD_USER_INPUT');
    }
  });

  test('update keeps the key; delete refused while a live thing uses it, allowed once trashed', async () => {
    const types = await starterTypes();
    const upd = (await ok(UPDATE, { id: types.tool.id, input: { name: 'Power tool', fields: [{ key: 'brand', label: 'Brand', kind: 'text' }] } })).updateThingType;
    expect(upd).toMatchObject({ key: 'tool', name: 'Power tool', fields: [{ key: 'brand' }] });

    const t = await createThing({ name: 'Drill', typeId: types.tool.id });
    const refused = await run(DELETE, { id: types.tool.id });
    expect(refused.errors[0].extensions.code).toBe('CONFLICT');
    expect(await ThingType.countDocuments({ _id: types.tool.id })).toBe(1);

    await ok(`mutation($id: ID!) { deleteThing(id: $id) { success } }`, { id: t.id });
    expect((await ok(DELETE, { id: types.tool.id })).deleteThingType.success).toBe(true);
    expect(await ThingType.countDocuments({ _id: types.tool.id })).toBe(0);
  });

  test('a foreign type cannot be updated or deleted', async () => {
    const res = await ThingType.collection.insertOne({ householdId: 'other-household', key: 'x', name: 'Theirs', fields: [] });
    const id = String(res.insertedId);
    expect(await errorCode(UPDATE, { id, input: { name: 'pwned' } })).toBe('NOT_FOUND');
    expect((await ok(DELETE, { id })).deleteThingType.success).toBe(false);
    expect((await ThingType.findById(id).lean()).name).toBe('Theirs');
    expect((await ok(TYPES)).thingTypes.map((t) => t.name)).not.toContain('Theirs');
  });
});
