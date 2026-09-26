/**
 * thinggeekFacets.test.js — the counts beside the filters.
 *
 *   - exclude-own-filter: each facet applies every active dimension except
 *     its own (q tokens count as their dimension: tag: is the tags facet's);
 *   - Where counts include everything inside (via the containment tree),
 *     and only locations and containers are offered;
 *   - kinds: locations are counted there but nowhere else — not in the total,
 *     types, missing, or the insurance totals;
 *   - due buckets (overdue | 30d | 90d | year) and missing keys come in a
 *     fixed order, zeros included;
 *   - trashed things never count.
 */
import {
  startHarness,
  stopHarness,
  cleanAll,
  ok,
  starterTypes,
  createThing,
  createLocation,
  insertFile,
  attach,
  dayFromToday,
} from './thinggeekHarness.js';

beforeAll(startHarness, 60000);
afterAll(async () => {
  await cleanAll();
  await stopHarness();
});

const FACETS = `query($filter: ThingFilterInput) { thingFacets(filter: $filter) {
  total types { value count } tags { value count } where { value count } kinds { value count }
  due { value count } missing { value count } acquiredYears { year count } hasPhotos hasDocuments
} }`;

let types;
let places;
const facets = async (filter = {}) => (await ok(FACETS, { filter })).thingFacets;
const asMap = (rows) => Object.fromEntries(rows.map((r) => [r.value, r.count]));

/**
 *  Wendy    boat         Boathouse           fishing, boat  2019  reg +20d     value, overview photo
 *  Finder   electronics  Boathouse>Wendy     fishing        2023  —
 *  Glock    firearm      House>Garage>Shelf  range          2020  warr -5d     serial, id-plate photo, receipt doc
 *  Drill    tool         House>Garage        —              2023  maint +80d
 *  Toaster  appliance    (none)              —              —     warr +200d
 *  (Trashed tool in Garage, tag fishing, due +1d — never counted)
 *  House, Garage, Shelf, Boathouse are Location things; Garage has a value
 *  and a due date — neither ever counts.
 */
beforeAll(async () => {
  await cleanAll();
  types = await starterTypes();
  const house = await createLocation('House');
  const garage = await createLocation('Garage', house.id);
  await ok(`mutation($id: ID!, $input: ThingInput!) { updateThing(id: $id, input: $input) { id } }`, {
    id: garage.id,
    input: { value: { amount: 50000 }, dates: [{ kind: 'insurance', date: dayFromToday(3) }] },
  });
  const shelf = await createLocation('Shelf', garage.id);
  const boathouse = await createLocation('Boathouse');
  places = { house, garage, shelf, boathouse };

  const wendy = await createThing({
    name: 'Wendy', typeId: types.boat.id, parentId: boathouse.id, tags: ['fishing', 'boat'],
    acquired: { date: '2019-05-01' }, dates: [{ kind: 'registration', date: dayFromToday(20) }], value: { amount: 1000 },
  });
  await attach(wendy.id, { photos: [{ fileId: (await insertFile())._id, role: 'overview' }] });
  places.wendy = wendy;
  await createThing({ name: 'Finder', typeId: types.electronics.id, parentId: wendy.id, tags: ['fishing'], acquired: { date: '2023-01-01' } });
  const glock = await createThing({
    name: 'Glock', typeId: types.firearm.id, parentId: shelf.id, tags: ['range'], acquired: { date: '2020-01-01' },
    dates: [{ kind: 'warranty', date: dayFromToday(-5) }], attributes: { serial: 'S1' },
  });
  await attach(glock.id, {
    photos: [{ fileId: (await insertFile())._id, role: 'id-plate' }],
    documents: [{ fileId: (await insertFile({ kind: 'document' }))._id, role: 'receipt' }],
  });
  await createThing({ name: 'Drill', typeId: types.tool.id, parentId: garage.id, acquired: { date: '2023-06-01' }, dates: [{ kind: 'maintenance', date: dayFromToday(80) }] });
  await createThing({ name: 'Toaster', typeId: types.appliance.id, dates: [{ kind: 'warranty', date: dayFromToday(200) }] });
  const gone = await createThing({ name: 'Gone', typeId: types.tool.id, parentId: garage.id, tags: ['fishing'], dates: [{ kind: 'other', date: dayFromToday(1) }] });
  await ok(`mutation($id: ID!) { deleteThing(id: $id) { success } }`, { id: gone.id });
}, 60000);

test('unfiltered: every facet, trashed excluded, Where includes everything inside', async () => {
  const f = await facets();
  expect(f.total).toBe(5);
  expect(asMap(f.types)).toEqual({
    [types.boat.id]: 1, [types.electronics.id]: 1, [types.firearm.id]: 1, [types.tool.id]: 1, [types.appliance.id]: 1,
  });
  expect(f.tags).toEqual([{ value: 'fishing', count: 2 }, { value: 'boat', count: 1 }, { value: 'range', count: 1 }]);
  // Wendy is a container: offered, holding the Finder.
  expect(asMap(f.where)).toEqual({
    [places.boathouse.id]: 2, [places.wendy.id]: 1, [places.house.id]: 2, [places.garage.id]: 2, [places.shelf.id]: 1,
  });
  expect(f.kinds).toEqual([
    { value: 'location', count: 4 },
    { value: 'container', count: 1 },
    { value: 'item', count: 4 },
  ]);
  expect(f.due).toEqual([
    { value: 'overdue', count: 1 },
    { value: '30d', count: 1 },
    { value: '90d', count: 2 },
    { value: 'year', count: 3 },
  ]);
  expect(f.missing).toEqual([
    { value: 'photo', count: 3 },
    { value: 'id-plate', count: 4 },
    { value: 'receipt', count: 4 },
    { value: 'serial', count: 4 },
    { value: 'value', count: 4 },
  ]);
  expect(f.acquiredYears).toEqual([{ year: 2019, count: 1 }, { year: 2020, count: 1 }, { year: 2023, count: 2 }]);
  expect(f.hasPhotos).toBe(2);
  expect(f.hasDocuments).toBe(1);
});

test('exclude-own: a tag filter narrows every facet but tags', async () => {
  const f = await facets({ tags: ['fishing'] });
  expect(f.total).toBe(2);
  expect(f.tags).toEqual([{ value: 'fishing', count: 2 }, { value: 'boat', count: 1 }, { value: 'range', count: 1 }]);
  expect(asMap(f.types)).toEqual({ [types.boat.id]: 1, [types.electronics.id]: 1 });
  expect(asMap(f.where)).toEqual({ [places.boathouse.id]: 2, [places.wendy.id]: 1 });
  expect(f.hasPhotos).toBe(1);
});

test('exclude-own: a Where filter keeps the whole tree counted', async () => {
  const f = await facets({ within: [places.garage.id] });
  expect(f.total).toBe(2);
  expect(asMap(f.where)).toEqual({
    [places.boathouse.id]: 2, [places.wendy.id]: 1, [places.house.id]: 2, [places.garage.id]: 2, [places.shelf.id]: 1,
  });
  expect(asMap(f.types)).toEqual({ [types.firearm.id]: 1, [types.tool.id]: 1 });
  // The same through the in: token.
  const g = await facets({ q: 'in:garage' });
  expect(g.total).toBe(2);
  expect(asMap(g.where)).toEqual(asMap(f.where));
});

test('exclude-own: a kinds filter keeps every kind counted; locations show only there', async () => {
  const f = await facets({ kinds: ['location'] });
  expect(f.total).toBe(4);
  expect(asMap(f.kinds)).toEqual({ location: 4, container: 1, item: 4 });
  // Locations are counted as locations — but nothing is ever "missing" on one.
  expect(asMap(f.missing)).toEqual({ photo: 0, 'id-plate': 0, receipt: 0, serial: 0, value: 0 });
  expect(asMap(f.where)).toEqual({ [places.house.id]: 2, [places.garage.id]: 1 });
});

test('exclude-own: due and missing buckets', async () => {
  const d = await facets({ due: ['overdue'] });
  expect(d.total).toBe(1);
  expect(asMap(d.due)).toEqual({ overdue: 1, '30d': 1, '90d': 2, year: 3 });
  expect(asMap(d.missing)).toEqual({ photo: 0, 'id-plate': 0, receipt: 0, serial: 0, value: 1 });

  const m = await facets({ missing: ['photo'] });
  expect(m.total).toBe(3);
  expect(asMap(m.missing)).toEqual({ photo: 3, 'id-plate': 4, receipt: 4, serial: 4, value: 4 });
  expect(m.hasPhotos).toBe(0);
  expect(asMap(m.due)).toEqual({ overdue: 0, '30d': 0, '90d': 1, year: 2 });

  // q tokens belong to their dimension too.
  const t = await facets({ q: 'due:30d missing:serial' });
  expect(t.total).toBe(1);
  expect(asMap(t.due).overdue).toBe(0);
  expect(asMap(t.due)['30d']).toBe(1);
});

test('the year facet ignores its own range; hasPhotos ignores its own flag', async () => {
  const y = await facets({ acquiredYearMin: 2023 });
  expect(y.total).toBe(2);
  expect(y.acquiredYears).toEqual([{ year: 2019, count: 1 }, { year: 2020, count: 1 }, { year: 2023, count: 2 }]);
  const p = await facets({ hasPhotos: true });
  expect(p.total).toBe(2);
  expect(p.hasPhotos).toBe(2);
});

test('a selected value with no matches still appears, at zero', async () => {
  const f = await facets({ tags: ['kayaking'] });
  expect(f.total).toBe(0);
  expect(asMap(f.tags).kayaking).toBe(0);
});

test('insurance totals follow the same filter', async () => {
  const q = `query($filter: ThingFilterInput) { thingInsuranceTotals(filter: $filter) { count totalValue currency withSerial withReceipt withPhoto } }`;
  expect((await ok(q, {})).thingInsuranceTotals).toEqual({ count: 5, totalValue: 1000, currency: 'USD', withSerial: 1, withReceipt: 1, withPhoto: 2 });
  // Never a location — the Garage's $50,000 is not inventory — whatever kinds asks for.
  expect((await ok(q, { filter: { kinds: ['location', 'container', 'item'] } })).thingInsuranceTotals).toMatchObject({ count: 5, totalValue: 1000 });
  expect((await ok(q, { filter: { kinds: ['location'] } })).thingInsuranceTotals).toMatchObject({ count: 0, totalValue: 0 });
  expect((await ok(q, { filter: { tags: ['fishing'] } })).thingInsuranceTotals).toEqual({
    count: 2, totalValue: 1000, currency: 'USD', withSerial: 0, withReceipt: 0, withPhoto: 1,
  });
});

test('needs attention never lists or counts a location', async () => {
  const a = (await ok(`query { thingAttention { overdue { name } dueSoon { name } missingPhoto missingValue missingReceipt } }`)).thingAttention;
  // The Garage's insurance date (+3d) is not "due soon"; Wendy's registration (+20d) is.
  expect(a.dueSoon.map((t) => t.name)).toEqual(['Wendy']);
  expect(a.overdue.map((t) => t.name)).toEqual(['Glock']);
  expect(a.missingPhoto).toBe(3);
  expect(a.missingValue).toBe(4);
  expect(a.missingReceipt).toBe(4);
});
