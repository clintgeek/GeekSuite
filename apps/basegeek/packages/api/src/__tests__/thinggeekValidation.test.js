/**
 * thinggeekValidation.test.js — what may be written.
 *
 *   - attributes are validated against the type: per kind, unknown keys
 *     rejected, required enforced on create only, null/'' clears;
 *   - changing typeId keeps attributes the new type also defines, drops the rest;
 *   - relationships: foreign / trashed / self targets rejected, duplicates collapse;
 *   - photos/documents input only edits existing entries;
 *   - containment (parentId): the parent is a live thing of the household,
 *     never itself or anything inside it (no cycles), depth ≤
 *     bounds.containDepth; path root→parent; contents by kind then name;
 *   - rendered output: fields in type order, identifier flag, missing[], URLs.
 */
import mongoose from 'mongoose';
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
  createLocation,
  move,
  insertFile,
  attach,
  Thing,
  CREATE_THING,
  UPDATE_THING,
  THING_FIELDS,
} from './thinggeekHarness.js';

const { bounds } = constantsModule;

beforeAll(startHarness, 60000);
beforeEach(cleanAll);
afterAll(async () => {
  await cleanAll();
  await stopHarness();
});

const CREATE_TYPE = `mutation($input: ThingTypeInput!) { createThingType(input: $input) { id key fields { key } } }`;

async function everyKindType() {
  const data = await ok(CREATE_TYPE, {
    input: {
      name: 'Everything',
      fields: [
        { key: 'txt', label: 'Text', kind: 'text' },
        { key: 'num', label: 'Number', kind: 'number', unit: 'ft' },
        { key: 'day', label: 'Date', kind: 'date' },
        { key: 'pick', label: 'Pick', kind: 'choice', choices: ['Red', 'Blue'] },
        { key: 'cost', label: 'Cost', kind: 'money' },
        { key: 'link', label: 'Link', kind: 'url' },
        { key: 'flag', label: 'Flag', kind: 'boolean' },
        { key: 'serial', label: 'Serial', kind: 'text', identifier: true },
        { key: 'must', label: 'Must', kind: 'text', required: true },
      ],
    },
  });
  return data.createThingType;
}

const createErr = async (input) => (await run(CREATE_THING, { input })).errors?.[0] ?? null;

describe('attributes against the type', () => {
  test('every kind accepts its valid value and stores it normalized', async () => {
    const type = await everyKindType();
    const t = await createThing({
      name: 'All',
      typeId: type.id,
      attributes: {
        txt: '  hello  ',
        num: 17.5,
        day: '2020-02-03T15:00:00Z',
        pick: 'Blue',
        cost: { amount: 12.5, currency: 'usd' },
        link: 'https://example.com/manual.pdf',
        flag: false,
        serial: 'SN-1',
        must: 'yes',
      },
    });
    expect(t.attributes).toEqual({
      txt: 'hello',
      num: 17.5,
      day: '2020-02-03T00:00:00.000Z',
      pick: 'Blue',
      cost: { amount: 12.5, currency: 'USD' },
      link: 'https://example.com/manual.pdf',
      flag: false,
      serial: 'SN-1',
      must: 'yes',
    });
    // fields: type order, raw value, identifier flag passed through.
    expect(t.fields.map((f) => f.key)).toEqual(['txt', 'num', 'day', 'pick', 'cost', 'link', 'flag', 'serial', 'must']);
    expect(t.fields.find((f) => f.key === 'serial')).toMatchObject({ identifier: true, value: 'SN-1', label: 'Serial' });
    expect(t.fields.find((f) => f.key === 'num')).toMatchObject({ unit: 'ft', identifier: false, value: 17.5 });
  });

  test.each([
    ['txt', 42],
    ['txt', 'x'.repeat(2001)],
    ['num', '12'],
    ['num', true],
    ['day', 'not a date'],
    ['day', true],
    ['pick', 'Green'],
    ['cost', { amount: -1 }],
    ['cost', { amount: 5, currency: 'dollars' }],
    ['cost', 5],
    ['link', 'javascript:alert(1)'],
    ['link', 'ftp://example.com'],
    ['link', 'not a url'],
    ['flag', 'yes'],
    ['nope', 'unknown key'],
  ])('rejects %s (case %#)', async (key, value) => {
    const type = await everyKindType();
    const err = await createErr({ name: 'Bad', typeId: type.id, attributes: { must: 'y', [key]: value } });
    expect(err.extensions.code).toBe('BAD_USER_INPUT');
    expect(err.extensions.details.map((d) => d.path)).toContain(`input.attributes.${key}`);
    expect(await Thing.countDocuments({})).toBe(0);
  });

  test('required on create; lenient on update (only provided keys validated)', async () => {
    const type = await everyKindType();
    const err = await createErr({ name: 'Missing must', typeId: type.id, attributes: {} });
    expect(err.extensions.details).toEqual([{ path: 'input.attributes.must', message: 'Must is required' }]);
    const t = await createThing({ name: 'ok', typeId: type.id, attributes: { must: 'x' } });
    const upd = (await ok(UPDATE_THING, { id: t.id, input: { attributes: { num: 3 } } })).updateThing;
    expect(upd.attributes).toEqual({ must: 'x', num: 3 });
    // null / '' clear a key; even the required one on update.
    const cleared = (await ok(UPDATE_THING, { id: t.id, input: { attributes: { num: null, must: '' } } })).updateThing;
    expect(cleared.attributes).toEqual({});
  });

  test('a thing with no type takes no attributes', async () => {
    expect((await createErr({ name: 'x', attributes: { a: 1 } })).extensions.code).toBe('BAD_USER_INPUT');
  });

  test('changing typeId keeps attributes the new type also has and drops the rest', async () => {
    const types = await starterTypes();
    const t = await createThing({
      name: 'Nikon',
      typeId: types.electronics.id,
      attributes: { brand: 'Nikon', model: 'Z6', serial: '1234' },
    });
    // tool: brand, model, power, serial. Adding power in the same call validates against the NEW type.
    const moved = (await ok(UPDATE_THING, { id: t.id, input: { typeId: types.tool.id, attributes: { power: 'Battery' } } })).updateThing;
    expect(moved.type.key).toBe('tool');
    expect(moved.attributes).toEqual({ brand: 'Nikon', model: 'Z6', serial: '1234', power: 'Battery' });
    // general has no fields: everything drops (and is gone from storage, not hidden).
    const general = (await ok(UPDATE_THING, { id: t.id, input: { typeId: types.general.id } })).updateThing;
    expect(general.attributes).toEqual({});
    expect((await Thing.findById(t.id).lean()).attributes).toEqual({});
    // Old-type keys are unknown to the new type.
    expect(await errorCode(UPDATE_THING, { id: t.id, input: { typeId: types.keyboard.id, attributes: { serial: 'x' } } })).toBe('BAD_USER_INPUT');
  });

  test('shape rules: name required and bounded, tags bounded and deduped, money not negative', async () => {
    expect((await createErr({ name: '   ' })).extensions.code).toBe('BAD_USER_INPUT');
    expect((await createErr({ name: 'x'.repeat(bounds.name.maxlength + 1) })).extensions.code).toBe('BAD_USER_INPUT');
    expect((await createErr({ name: 'x', tags: ['t'.repeat(61)] })).extensions.code).toBe('BAD_USER_INPUT');
    expect((await createErr({ name: 'x', value: { amount: -5 } })).extensions.code).toBe('BAD_USER_INPUT');
    expect((await createErr({ name: 'x', dates: [{ kind: 'birthday', date: '2026-01-01' }] })).extensions.code).toBe('BAD_USER_INPUT');
    const t = await createThing({ name: 'x', tags: ['Fishing', 'fishing', 'boat'] });
    expect(t.tags).toEqual(['Fishing', 'boat']);
    expect(await errorCode(UPDATE_THING, { id: t.id, input: { name: null } })).toBe('BAD_USER_INPUT');
  });
});

describe('relationships', () => {
  test('stored one way, the inverse derived; ThingSummary carries the cover thumb', async () => {
    const wendy = await createThing({ name: 'Wendy' });
    const finder = await createThing({ name: 'Fish finder' });
    const file = await insertFile();
    await attach(finder.id, { photos: [{ fileId: file._id, role: 'overview' }] });
    const w = (await ok(UPDATE_THING, { id: wendy.id, input: { relationships: [{ kind: 'accessory-of', thingId: finder.id }] } })).updateThing;
    expect(w.relationships).toEqual([
      expect.objectContaining({ kind: 'accessory-of', direction: 'out', thing: expect.objectContaining({ name: 'Fish finder', coverThumbUrl: `/api/files/${file._id}/thumb` }) }),
    ]);
    const f = (await ok(`query($id: ID!) { thing(id: $id) { ${THING_FIELDS} } }`, { id: finder.id })).thing;
    expect(f.relationships).toEqual([
      { id: expect.stringMatching(/^in-/), kind: 'accessory-of', direction: 'in', thing: { id: wendy.id, name: 'Wendy', coverThumbUrl: null, type: null } },
    ]);
  });

  test('self, trashed and unknown targets are rejected; duplicates collapse', async () => {
    const a = await createThing({ name: 'A' });
    const b = await createThing({ name: 'B' });
    const gone = await createThing({ name: 'Gone' });
    await ok(`mutation($id: ID!) { deleteThing(id: $id) { success } }`, { id: gone.id });
    for (const thingId of [a.id, gone.id, String(new mongoose.Types.ObjectId()), 'not-an-id']) {
      expect(await errorCode(UPDATE_THING, { id: a.id, input: { relationships: [{ kind: 'accessory-of', thingId }] } })).toBe('BAD_USER_INPUT');
    }
    // The kinds retired with containment (2026-09-26) are unknown now.
    for (const kind of ['married-to', 'equipped-with', 'part-of', 'stored-with']) {
      expect(await errorCode(UPDATE_THING, { id: a.id, input: { relationships: [{ kind, thingId: b.id }] } })).toBe('BAD_USER_INPUT');
    }
    const dup = (await ok(UPDATE_THING, {
      id: a.id,
      input: { relationships: [{ kind: 'accessory-of', thingId: b.id }, { kind: 'accessory-of', thingId: b.id }] },
    })).updateThing;
    expect(dup.relationships.map((r) => r.kind)).toEqual(['accessory-of']);
    expect((await createErr({ name: 'C', relationships: [{ kind: 'accessory-of', thingId: gone.id }] })).extensions.code).toBe('BAD_USER_INPUT');
  });

  test('a relationship whose target is later trashed is hidden, and returns on restore', async () => {
    const a = await createThing({ name: 'A' });
    const b = await createThing({ name: 'B' });
    await ok(UPDATE_THING, { id: a.id, input: { relationships: [{ kind: 'accessory-of', thingId: b.id }] } });
    await ok(`mutation($id: ID!) { deleteThing(id: $id) { success } }`, { id: b.id });
    const q = `query($id: ID!) { thing(id: $id) { relationships { direction thing { name } } } }`;
    expect((await ok(q, { id: a.id })).thing.relationships).toEqual([]);
    await ok(`mutation($id: ID!) { restoreThing(id: $id) { id } }`, { id: b.id });
    expect((await ok(q, { id: a.id })).thing.relationships).toEqual([{ direction: 'out', thing: { name: 'B' } }]);
  });
});

describe('photos, documents and missing[]', () => {
  test('URLs point at the backend; thumbUrl null without a thumb; cover prefers overview', async () => {
    const types = await starterTypes();
    const t = await createThing({ name: 'Glock', typeId: types.firearm.id });
    expect(t.missing).toEqual(['photo', 'id-plate', 'receipt', 'serial', 'value']);
    const plate = await insertFile({ thumb: false });
    const over = await insertFile();
    const receipt = await insertFile({ kind: 'document', mime: 'application/pdf', thumb: false });
    await attach(t.id, { photos: [{ fileId: plate._id, role: 'id-plate' }, { fileId: over._id, role: 'overview' }], documents: [{ fileId: receipt._id, role: 'receipt' }] });
    const got = (await ok(`query($id: ID!) { thing(id: $id) { ${THING_FIELDS} } }`, { id: t.id })).thing;
    expect(got.photos.map((p) => [p.role, p.url, p.thumbUrl, p.width])).toEqual([
      ['id-plate', `/api/files/${plate._id}`, null, 800],
      ['overview', `/api/files/${over._id}`, `/api/files/${over._id}/thumb`, 800],
    ]);
    expect(got.coverPhoto.url).toBe(`/api/files/${over._id}`);
    expect(got.documents).toEqual([
      expect.objectContaining({ role: 'receipt', url: `/api/files/${receipt._id}`, mime: 'application/pdf', size: 1234, originalName: 'photo.jpg' }),
    ]);
    expect(got.missing).toEqual(['serial', 'value']);
    const filled = (await ok(UPDATE_THING, { id: t.id, input: { attributes: { serial: 'X1' }, value: { amount: 500 } } })).updateThing;
    expect(filled.missing).toEqual([]);
  });

  test('id-plate and serial only apply to types with identifier fields; a receipt photo counts', async () => {
    const types = await starterTypes();
    const kb = await createThing({ name: 'Keyboard', typeId: types.keyboard.id, value: { amount: 0 } });
    expect(kb.missing).toEqual(['photo', 'receipt']);
    const file = await insertFile();
    await attach(kb.id, { photos: [{ fileId: file._id, role: 'receipt' }] });
    expect((await ok(`query($id: ID!) { thing(id: $id) { missing } }`, { id: kb.id })).thing.missing).toEqual([]);
  });

  test('photos input edits and reorders existing photos only', async () => {
    const t = await createThing({ name: 'Cam' });
    const f1 = await insertFile();
    const f2 = await insertFile();
    await attach(t.id, { photos: [{ fileId: f1._id }, { fileId: f2._id }] });
    const cur = (await ok(`query($id: ID!) { thing(id: $id) { photos { id } } }`, { id: t.id })).thing.photos;
    const upd = (await ok(UPDATE_THING, { id: t.id, input: { photos: [{ id: cur[1].id, role: 'id-plate', caption: 'plate' }, { id: cur[0].id }] } })).updateThing;
    expect(upd.photos.map((p) => [p.id, p.role, p.caption])).toEqual([
      [cur[1].id, 'id-plate', 'plate'],
      [cur[0].id, 'overview', ''],
    ]);
    expect(await errorCode(UPDATE_THING, { id: t.id, input: { photos: [{ id: String(new mongoose.Types.ObjectId()) }] } })).toBe('BAD_USER_INPUT');
    expect(await errorCode(UPDATE_THING, { id: t.id, input: { photos: [{ id: cur[0].id }, { id: cur[0].id }] } })).toBe('BAD_USER_INPUT');
    expect((await createErr({ name: 'x', photos: [{ id: cur[0].id }] })).extensions.code).toBe('BAD_USER_INPUT');
  });
});

describe('containment', () => {
  const TREE = `query { thingTree { name parentId kind childCount itemCount } }`;
  const detailsOf = (res) => res.errors?.[0]?.extensions?.details ?? null;

  test('path is root → parent; contents are live things directly inside, locations, containers, then items', async () => {
    const types = await starterTypes();
    const house = await createLocation('House');
    const garage = await createLocation('Garage', house.id);
    const van = await createThing({ name: 'Van', typeId: types.vehicle.id, parentId: garage.id });
    const cables = await createThing({ name: 'Jumper cables', typeId: types.tool.id, parentId: van.id });
    await createThing({ name: 'Aftermarket stereo', typeId: types.electronics.id, parentId: van.id });
    await createThing({ name: 'Axe', typeId: types.tool.id, parentId: garage.id });
    await createLocation('Shelf', garage.id);
    const gone = await createThing({ name: 'Old rake', parentId: garage.id });
    await ok(`mutation($id: ID!) { deleteThing(id: $id) { success } }`, { id: gone.id });

    expect(cables.path.map((p) => [p.name, p.kind])).toEqual([
      ['House', 'location'],
      ['Garage', 'location'],
      ['Van', 'container'],
    ]);
    expect(cables).toMatchObject({ kind: 'item', parentId: van.id, contentsCount: 0 });
    const g = (await ok(`query($id: ID!) { thing(id: $id) { kind missing contentsCount contents { name kind } } }`, { id: garage.id })).thing;
    expect(g.kind).toBe('location');
    // Not inventory: no photo, no value, no receipt — and nothing "missing".
    expect(g.missing).toEqual([]);
    expect(g.contentsCount).toBe(3);
    expect(g.contents).toEqual([
      { name: 'Shelf', kind: 'location' },
      { name: 'Van', kind: 'container' },
      { name: 'Axe', kind: 'item' },
    ]);
    // The tree: every live thing, depth-first; itemCount is inventory inside (not the Shelf).
    expect((await ok(TREE)).thingTree.map((n) => [n.name, n.kind, n.childCount, n.itemCount])).toEqual([
      ['House', 'location', 1, 4],
      ['Garage', 'location', 3, 4],
      ['Axe', 'item', 0, 0],
      ['Shelf', 'location', 0, 0],
      ['Van', 'container', 2, 2],
      ['Aftermarket stereo', 'item', 0, 0],
      ['Jumper cables', 'item', 0, 0],
    ]);
  });

  test('moving a container moves everything in it', async () => {
    const types = await starterTypes();
    const house = await createLocation('House');
    const garage = await createLocation('Garage', house.id);
    const driveway = await createLocation('Driveway', house.id);
    const van = await createThing({ name: 'Van', typeId: types.vehicle.id, parentId: garage.id });
    const cables = await createThing({ name: 'Jumper cables', typeId: types.tool.id, parentId: van.id });
    expect((await move(van.id, driveway.id)).errors).toBeNull();
    const t = (await ok(`query($id: ID!) { thing(id: $id) { path { name } } }`, { id: cables.id })).thing;
    expect(t.path.map((p) => p.name)).toEqual(['House', 'Driveway', 'Van']);
    // Anything may be a parent via Move — even an item — and null is the top level.
    const drill = await createThing({ name: 'Drill', typeId: types.tool.id });
    expect((await move(cables.id, drill.id)).errors).toBeNull();
    expect((await move(cables.id, null)).data.updateThing.parentId).toBeNull();
  });

  test('no cycles: not into itself, not into anything inside it', async () => {
    const a = await createLocation('A');
    const b = await createLocation('B', a.id);
    const c = await createLocation('C', b.id);
    const self = await move(a.id, a.id);
    expect(detailsOf(self)).toEqual([{ path: 'input.parentId', message: 'a thing cannot be inside itself' }]);
    const down = await move(a.id, c.id);
    expect(detailsOf(down)).toEqual([{ path: 'input.parentId', message: 'a thing cannot move inside something it contains' }]);
    expect(detailsOf(await move(a.id, b.id))).toEqual([{ path: 'input.parentId', message: 'a thing cannot move inside something it contains' }]);
    expect((await Thing.findById(a.id).lean()).parentId).toBeNull();
    // A legal move: C up to the top, then under A.
    expect((await move(c.id, null)).errors).toBeNull();
    expect((await move(c.id, a.id)).data.updateThing.parentId).toBe(a.id);
  });

  test(`depth is capped at ${bounds.containDepth.max}, for creates and for moving a subtree`, async () => {
    let parent = null;
    const chain = [];
    for (let i = 1; i <= bounds.containDepth.max; i += 1) {
      parent = await createLocation(`L${i}`, parent?.id ?? null);
      chain.push(parent);
    }
    const tooDeep = await run(CREATE_THING, { input: { name: 'too deep', parentId: parent.id } });
    expect(tooDeep.errors[0].extensions.details).toEqual([
      { path: 'input.parentId', message: `things nest at most ${bounds.containDepth.max} deep` },
    ]);
    // A two-level subtree can hang at most under depth max-2.
    const box = await createLocation('Box');
    await createLocation('Inner', box.id);
    expect(await errorCode(UPDATE_THING, { id: box.id, input: { parentId: chain[bounds.containDepth.max - 2].id } })).toBe('BAD_USER_INPUT');
    expect((await move(box.id, chain[bounds.containDepth.max - 3].id)).data.updateThing.parentId).toBe(chain[bounds.containDepth.max - 3].id);
  });

  test('the parent must exist and not be in the Trash', async () => {
    const t = await createThing({ name: 'Cables' });
    const van = await createThing({ name: 'Van' });
    await ok(`mutation($id: ID!) { deleteThing(id: $id) { success } }`, { id: van.id });
    for (const [parentId, message] of [
      [van.id, 'that thing is in the Trash'],
      [String(new mongoose.Types.ObjectId()), 'thing not found'],
      ['not-an-id', null],
    ]) {
      const res = await move(t.id, parentId);
      expect(res.errors[0].extensions.code).toBe('BAD_USER_INPUT');
      if (message) expect(detailsOf(res)).toEqual([{ path: 'input.parentId', message }]);
    }
    expect((await Thing.findById(t.id).lean()).parentId).toBeNull();
  });
});
