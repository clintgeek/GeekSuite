/**
 * thinggeekSearch.test.js — the deterministic search box (no AI).
 *
 * Every q token (type:, tag:, in:, before:, after:, expiring:, due:,
 * missing:, has:), free text (AND of words over name, notes, tags and
 * attribute values — identifiers included), tagMatch, the structured
 * ThingFilterInput fields, and the rule that tokens AND with structured
 * fields. See graphql/thinggeek/filters.js for the grammar.
 */
import {
  startHarness,
  stopHarness,
  cleanAll,
  errorCode,
  starterTypes,
  createThing,
  createPlace,
  insertFile,
  attach,
  names,
  dayFromToday,
  THINGS,
} from './thinggeekHarness.js';

beforeAll(startHarness, 60000);
afterAll(async () => {
  await cleanAll();
  await stopHarness();
});

let types;
let places;

/**
 *  name          type         place                 tags             acquired     value  dates           notes / attrs
 *  Wendy         boat         Boathouse             fishing, boat    2019-06-15   20000  reg +20d        "the family boat"; Lund, hull LUND1234
 *  Fish finder   electronics  Boathouse             fishing          2023-07-02   —      —               Garmin Striker 4, serial GRM-998; overview photo
 *  Glock 19      firearm      House>Garage>Shelf 2  range            2020-01-10   500    warranty -5d    serial ABC123; id-plate photo, receipt doc
 *  Drill         tool         House>Garage          Power            2023-06-10   —      maint +80d      DeWalt, Battery
 *  Toaster       appliance    House>Kitchen         —                —            —      —               "Breville 4-slice"
 */
beforeAll(async () => {
  await cleanAll();
  types = await starterTypes();
  const house = await createPlace('House');
  const garage = await createPlace('Garage', house.id);
  const shelf = await createPlace('Shelf 2', garage.id);
  const kitchen = await createPlace('Kitchen', house.id);
  const boathouse = await createPlace('Boathouse');
  places = { house, garage, shelf, kitchen, boathouse };

  await createThing({
    name: 'Wendy',
    typeId: types.boat.id,
    placeId: boathouse.id,
    tags: ['fishing', 'boat'],
    acquired: { date: '2019-06-15' },
    value: { amount: 20000 },
    dates: [{ kind: 'registration', date: dayFromToday(20) }],
    notes: 'the family boat',
    attributes: { manufacturer: 'Lund', hullNumber: 'LUND1234' },
  });
  const finder = await createThing({
    name: 'Fish finder',
    typeId: types.electronics.id,
    placeId: boathouse.id,
    tags: ['fishing'],
    acquired: { date: '2023-07-02' },
    attributes: { brand: 'Garmin', model: 'Striker 4', serial: 'GRM-998' },
  });
  await attach(finder.id, { photos: [{ fileId: (await insertFile())._id, role: 'overview' }] });
  const glock = await createThing({
    name: 'Glock 19',
    typeId: types.firearm.id,
    placeId: shelf.id,
    tags: ['range'],
    acquired: { date: '2020-01-10' },
    value: { amount: 500 },
    dates: [{ kind: 'warranty', date: dayFromToday(-5) }],
    attributes: { serial: 'ABC123', kind: 'Handgun' },
  });
  await attach(glock.id, {
    photos: [{ fileId: (await insertFile())._id, role: 'id-plate' }],
    documents: [{ fileId: (await insertFile({ kind: 'document' }))._id, role: 'receipt' }],
  });
  await createThing({
    name: 'Drill',
    typeId: types.tool.id,
    placeId: garage.id,
    tags: ['Power'],
    acquired: { date: '2023-06-10' },
    dates: [{ kind: 'maintenance', date: dayFromToday(80) }],
    attributes: { brand: 'DeWalt', power: 'Battery' },
  });
  await createThing({ name: 'Toaster', typeId: types.appliance.id, placeId: kitchen.id, notes: 'Breville 4-slice' });
}, 60000);

const q = (text, extra = {}) => names({ q: text, ...extra });

describe('tokens', () => {
  test('type: by key or name, case-insensitive; repeated = any; unknown = nothing', async () => {
    expect(await q('type:boat')).toEqual(['Wendy']);
    expect(await q('type:Firearm')).toEqual(['Glock 19']);
    expect(await q('type:boat type:firearm')).toEqual(['Glock 19', 'Wendy']);
    expect(await q('type:spaceship')).toEqual([]);
  });

  test('tag: case-insensitive exact; tagMatch any|all', async () => {
    expect(await q('tag:fishing')).toEqual(['Fish finder', 'Wendy']);
    expect(await q('tag:POWER')).toEqual(['Drill']);
    expect(await q('tag:fish')).toEqual([]);
    expect(await q('tag:fishing tag:boat')).toEqual(['Fish finder', 'Wendy']);
    expect(await q('tag:fishing tag:boat', { tagMatch: 'all' })).toEqual(['Wendy']);
  });

  test('in: name, name path (suffix), quoted, or id — descendants included', async () => {
    expect(await q('in:garage')).toEqual(['Drill', 'Glock 19']);
    expect(await q('in:"shelf 2"')).toEqual(['Glock 19']);
    expect(await q('in:house')).toEqual(['Drill', 'Glock 19', 'Toaster']);
    expect(await q('in:house/garage')).toEqual(['Drill', 'Glock 19']);
    expect(await q('in:"House > Kitchen"')).toEqual(['Toaster']);
    expect(await q(`in:${places.garage.id}`)).toEqual(['Drill', 'Glock 19']);
    expect(await q('in:kitchen/garage')).toEqual([]);
    expect(await q('in:attic')).toEqual([]);
  });

  test('before: / after: are strict, over the whole period', async () => {
    expect(await q('before:2020')).toEqual(['Wendy']);
    expect(await q('after:2023-06')).toEqual(['Fish finder']);
    expect(await q('after:2023')).toEqual([]);
    expect(await q('before:2023-06-10')).toEqual(['Glock 19', 'Wendy']);
    expect(await q('before:2023-06-11')).toEqual(['Drill', 'Glock 19', 'Wendy']);
    expect(await q('after:2019-06-15')).toEqual(['Drill', 'Fish finder', 'Glock 19']);
    expect(await q('after:2019 before:2023')).toEqual(['Glock 19']);
    // A bad period is just text (matches nothing here).
    expect(await q('before:2023-13')).toEqual([]);
  });

  test('due: / expiring: — within N days, overdue included', async () => {
    expect(await q('due:30d')).toEqual(['Glock 19', 'Wendy']);
    expect(await q('expiring:90d')).toEqual(['Drill', 'Glock 19', 'Wendy']);
    expect(await q('due:0d')).toEqual(['Glock 19']);
    expect(await q('expiring:19')).toEqual(['Glock 19']);
  });

  test('missing: every key', async () => {
    expect(await q('missing:photo')).toEqual(['Drill', 'Toaster', 'Wendy']);
    // boat: registrationNumber empty; tool/appliance: serial empty; electronics/firearm have serials.
    expect(await q('missing:serial')).toEqual(['Drill', 'Toaster', 'Wendy']);
    expect(await q('missing:id-plate')).toEqual(['Drill', 'Fish finder', 'Toaster', 'Wendy']);
    expect(await q('missing:receipt')).toEqual(['Drill', 'Fish finder', 'Toaster', 'Wendy']);
    expect(await q('missing:value')).toEqual(['Drill', 'Fish finder', 'Toaster']);
    expect(await q('missing:photo missing:value')).toEqual(['Drill', 'Toaster']);
    expect(await q('missing:foo')).toEqual([]);
  });

  test('has: photo | document | receipt | value', async () => {
    expect(await q('has:photo')).toEqual(['Fish finder', 'Glock 19']);
    expect(await q('has:document')).toEqual(['Glock 19']);
    expect(await q('has:receipt')).toEqual(['Glock 19']);
    expect(await q('has:value')).toEqual(['Glock 19', 'Wendy']);
  });
});

describe('free text', () => {
  test('over name, notes, tags and attribute values — identifiers included', async () => {
    expect(await q('lund')).toEqual(['Wendy']);
    expect(await q('LUND1234')).toEqual(['Wendy']);
    expect(await q('grm-998')).toEqual(['Fish finder']);
    expect(await q('family')).toEqual(['Wendy']);
    expect(await q('breville')).toEqual(['Toaster']);
    expect(await q('fish')).toEqual(['Fish finder', 'Wendy']); // name, and Wendy's "fishing" tag
    expect(await q('handgun')).toEqual(['Glock 19']); // a choice value
  });

  test('every word must match (AND); quoted phrases stay together', async () => {
    expect(await q('garmin striker')).toEqual(['Fish finder']);
    expect(await q('garmin lund')).toEqual([]);
    expect(await q('"striker 4"')).toEqual(['Fish finder']);
    expect(await q('"4 striker"')).toEqual([]);
  });

  test('escaped: regex metacharacters are literals', async () => {
    expect(await q('a.c')).toEqual([]);
    expect(await q('(')).toEqual([]);
    expect(await q('.*')).toEqual([]);
  });

  test('tokens and words combine; unknown keys are text', async () => {
    expect(await q('type:boat lund')).toEqual(['Wendy']);
    expect(await q('tag:fishing garmin')).toEqual(['Fish finder']);
    expect(await q('in:boathouse has:photo')).toEqual(['Fish finder']);
    expect(await q('color:red')).toEqual([]);
  });
});

describe('structured filter fields', () => {
  test('types, tags, places (descendants), due, missing (any-of), photos/documents, years, value', async () => {
    expect(await names({ types: [types.boat.id, types.tool.id] })).toEqual(['Drill', 'Wendy']);
    expect(await names({ tags: ['fishing', 'range'] })).toEqual(['Fish finder', 'Glock 19', 'Wendy']);
    expect(await names({ tags: ['fishing', 'boat'], tagMatch: 'all' })).toEqual(['Wendy']);
    expect(await names({ places: [places.house.id] })).toEqual(['Drill', 'Glock 19', 'Toaster']);
    expect(await names({ places: [places.shelf.id, places.boathouse.id] })).toEqual(['Fish finder', 'Glock 19', 'Wendy']);
    expect(await names({ due: ['overdue'] })).toEqual(['Glock 19']);
    expect(await names({ due: ['30d'] })).toEqual(['Wendy']);
    expect(await names({ due: ['90d'] })).toEqual(['Drill', 'Wendy']);
    expect(await names({ due: ['overdue', 'year'] })).toEqual(['Drill', 'Glock 19', 'Wendy']);
    expect(await names({ missing: ['value', 'photo'] })).toEqual(['Drill', 'Fish finder', 'Toaster', 'Wendy']);
    expect(await names({ hasPhotos: true })).toEqual(['Fish finder', 'Glock 19']);
    expect(await names({ hasPhotos: false })).toEqual(['Drill', 'Toaster', 'Wendy']);
    expect(await names({ hasDocuments: true })).toEqual(['Glock 19']);
    expect(await names({ acquiredYearMin: 2020, acquiredYearMax: 2023 })).toEqual(['Drill', 'Fish finder', 'Glock 19']);
    expect(await names({ acquiredYearMax: 2019 })).toEqual(['Wendy']);
    expect(await names({ valueMin: 100, valueMax: 1000 })).toEqual(['Glock 19']);
    expect(await names({ valueMin: 0 })).toEqual(['Glock 19', 'Wendy']);
  });

  test('tokens AND with the structured field of the same dimension', async () => {
    expect(await names({ types: [types.firearm.id], q: 'type:boat' })).toEqual([]);
    expect(await names({ types: [types.boat.id, types.firearm.id], q: 'type:boat' })).toEqual(['Wendy']);
    expect(await names({ places: [places.house.id], q: 'in:garage' })).toEqual(['Drill', 'Glock 19']);
  });

  test('closed vocabularies are validated', async () => {
    for (const filter of [{ tagMatch: 'some' }, { due: ['7d'] }, { missing: ['hat'] }, { acquiredYearMin: 2024, acquiredYearMax: 2020 }, { householdId: 'x' }]) {
      expect(await errorCode(THINGS, { filter })).toBe('BAD_USER_INPUT');
    }
  });
});
