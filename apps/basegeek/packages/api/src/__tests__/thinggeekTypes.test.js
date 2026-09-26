/**
 * thinggeekTypes.test.js — starter types and the type editor.
 *
 *   - STARTER_TYPES are seeded once per HOUSEHOLD: idempotent, safe under two
 *     concurrent first calls (the unique {householdId,key} index), recorded
 *     on the caller's profile, and never re-seeded for the second member (a
 *     starter someone deleted stays deleted).
 *   - A household seeded before containment (starter-type version 1) is
 *     UPGRADED on its next call: every type gets a kind, Location and
 *     Storage are added, and a v1 starter someone deleted stays deleted.
 *   - thingCount excludes trashed things.
 *   - deleteThingType is refused while a live thing uses the type; kind →
 *     item is refused while any of its things contain things.
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

const { STARTER_TYPES, STARTER_TYPES_VERSION } = constantsModule;

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
    // The spec's kinds: Location is a location; Storage, Boat and Vehicle are containers; the rest items.
    expect(Object.fromEntries(Object.values(types).map((t) => [t.key, t.kind]))).toEqual({
      location: 'location', storage: 'container', boat: 'container', vehicle: 'container',
      firearm: 'item', tool: 'item', electronics: 'item', keyboard: 'item', appliance: 'item', camera: 'item', general: 'item',
    });
    expect(types.location.fields).toEqual([]);
    expect(types.storage.fields.map((f) => [f.key, f.identifier])).toEqual([['brand', false], ['model', false], ['serial', true]]);
    const profile = await ThingProfile.findOne({ userId: CHEF }).lean();
    expect(profile.starterTypesSeededAt).toBeInstanceOf(Date);
    expect(profile.starterTypesVersion).toBe(STARTER_TYPES_VERSION);
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

describe('the containment upgrade (a household seeded at version 1)', () => {
  const V1_KEYS = ['boat', 'vehicle', 'firearm', 'tool', 'electronics', 'keyboard', 'appliance', 'camera', 'general'];

  /** Production on 2026-09-26: the nine v1 types, no kind stored, one seeded profile with no version. */
  async function seedV1({ without = [] } = {}) {
    const docs = STARTER_TYPES.filter((t) => V1_KEYS.includes(t.key) && !without.includes(t.key)).map((t) => ({
      householdId: 'default', key: t.key, name: t.name, icon: t.icon, builtIn: true, fields: [],
    }));
    await ThingType.collection.insertMany(docs);
    await ThingType.collection.insertOne({ householdId: 'default', key: 'kayak', name: 'Kayak', builtIn: false, fields: [] });
    await ThingProfile.collection.insertOne({ householdId: 'default', userId: CHEF, savedFilters: [], starterTypesSeededAt: new Date('2026-09-25') });
  }

  test('kinds are set, Location and Storage added, the version recorded', async () => {
    await seedV1();
    const types = await starterTypes(CHEF);
    expect(Object.keys(types).sort()).toEqual([...V1_KEYS, 'kayak', 'location', 'storage'].sort());
    expect(types.boat.kind).toBe('container');
    expect(types.vehicle.kind).toBe('container');
    expect(types.firearm.kind).toBe('item');
    expect(types.kayak.kind).toBe('item');
    expect(types.location.kind).toBe('location');
    expect(types.storage.kind).toBe('container');
    // Stored, not just defaulted on read.
    expect((await ThingType.collection.findOne({ key: 'boat' })).kind).toBe('container');
    expect((await ThingProfile.findOne({ userId: CHEF }).lean()).starterTypesVersion).toBe(STARTER_TYPES_VERSION);
    // Idempotent, and the second member does nothing more.
    await starterTypes(CHEF);
    await starterTypes(HEATHER);
    expect(await ThingType.countDocuments({ householdId: 'default' })).toBe(V1_KEYS.length + 3);
  });

  test('a v1 starter the household deleted stays deleted; a kind it chose is kept', async () => {
    await seedV1({ without: ['camera'] });
    await ThingType.collection.updateOne({ key: 'kayak' }, { $set: { kind: 'container' } });
    const types = await starterTypes(HEATHER);
    expect(types.camera).toBeUndefined();
    expect(types.kayak.kind).toBe('container');
    expect(types.location).toBeDefined();
  });

  test('a household already on the current version is not upgraded again (a deleted Location stays deleted)', async () => {
    const types = await starterTypes(CHEF);
    await ok(`mutation($id: ID!) { deleteThingType(id: $id) { success } }`, { id: types.location.id });
    expect((await starterTypes(CHEF)).location).toBeUndefined();
    expect((await starterTypes(HEATHER)).location).toBeUndefined();
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
  const CREATE = `mutation($input: ThingTypeInput!) { createThingType(input: $input) { id key name icon kind builtIn fields { key kind choices identifier required } } }`;
  const UPDATE = `mutation($id: ID!, $input: ThingTypeInput!) { updateThingType(id: $id, input: $input) { id key name kind fields { key } } }`;
  const DELETE = `mutation($id: ID!) { deleteThingType(id: $id) { success message } }`;

  test('create picks a unique key per household', async () => {
    await starterTypes();
    const t = (await ok(CREATE, { input: { name: 'Boat', fields: [{ key: 'hin', label: 'HIN', kind: 'text', identifier: true }] } })).createThingType;
    expect(t.key).toBe('boat-2');
    expect(t.builtIn).toBe(false);
    expect(t.icon).toBe('Inventory2');
    expect(t.kind).toBe('item');
    const u = (await ok(CREATE, { input: { name: 'Bicycle' } })).createThingType;
    expect(u.key).toBe('bicycle');
    expect((await ok(CREATE, { input: { name: 'Toolbox', kind: 'container' } })).createThingType.kind).toBe('container');
    expect(await errorCode(CREATE, { input: { name: 'Nope', kind: 'room' } })).toBe('BAD_USER_INPUT');
  });

  test('kind → item is refused while any of its things contain things; allowed once they are empty', async () => {
    const types = await starterTypes();
    const van = await createThing({ name: 'Van', typeId: types.vehicle.id });
    const cables = await createThing({ name: 'Jumper cables', typeId: types.tool.id, parentId: van.id });
    const refused = await run(UPDATE, { id: types.vehicle.id, input: { kind: 'item' } });
    expect(refused.errors[0].extensions.code).toBe('CONFLICT');
    expect(refused.errors[0].message).toBe('1 thing of this type has things inside. Move them out first.');
    expect((await ThingType.findById(types.vehicle.id).lean()).kind).toBe('container');
    // Other kind changes are fine while full; so is kind → item for a type whose things are empty.
    expect((await ok(UPDATE, { id: types.vehicle.id, input: { kind: 'location' } })).updateThingType.kind).toBe('location');
    expect((await ok(UPDATE, { id: types.vehicle.id, input: { kind: 'container' } })).updateThingType.kind).toBe('container');
    expect(await errorCode(UPDATE, { id: types.vehicle.id, input: { kind: null } })).toBe('BAD_USER_INPUT');
    // Trashed contents don't hold it; moving them out lets it through.
    await ok(`mutation($id: ID!, $input: ThingInput!) { updateThing(id: $id, input: $input) { id } }`, { id: cables.id, input: { parentId: null } });
    expect((await ok(UPDATE, { id: types.vehicle.id, input: { kind: 'item' } })).updateThingType.kind).toBe('item');
    void van;
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
