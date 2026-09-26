/**
 * thinggeekSorts.test.js — every advertised sort, both directions, with an
 * order-asserting test (BookGeek once advertised sorts that silently fell
 * back to title). Rules: nulls LAST in both directions; ties break on
 * sortName then _id; `random` is stable for a seed across pages; an unknown
 * sort is a validation error.
 *
 * Every order below differs from alphabetical, so a regression to "sort by
 * name" cannot pass by accident.
 */
import {
  startHarness,
  stopHarness,
  cleanAll,
  ok,
  errorCode,
  createThing,
  names,
  dayFromToday,
  Thing,
  THINGS,
} from './thinggeekHarness.js';

const { THING_SORTS } = await import('../graphql/thinggeek/validation.js');

beforeAll(startHarness, 60000);
afterAll(async () => {
  await cleanAll();
  await stopHarness();
});

/**
 *  name        sortName      created  acquired     value  nextDue
 *  Zodiac      zodiac        1st      2021-01-01   300    +10d
 *  The Anchor  anchor, the   2nd      —            50     —
 *  Mower       mower         3rd      2018-05-05   —      -3d (overdue)
 *  Kayak       kayak         4th      2022-02-02   900    +100d (a -50d date too: upcoming wins)
 *  Bike        bike          5th      2015-03-03   120    +5d
 */
beforeAll(async () => {
  await cleanAll();
  const rows = [
    { name: 'Zodiac', acquired: { date: '2021-01-01' }, value: { amount: 300 }, dates: [{ kind: 'other', date: dayFromToday(10) }] },
    { name: 'The Anchor', value: { amount: 50 } },
    { name: 'Mower', acquired: { date: '2018-05-05' }, dates: [{ kind: 'other', date: dayFromToday(-3) }] },
    {
      name: 'Kayak',
      acquired: { date: '2022-02-02' },
      value: { amount: 900 },
      dates: [{ kind: 'other', date: dayFromToday(100) }, { kind: 'other', date: dayFromToday(-50) }],
    },
    { name: 'Bike', acquired: { date: '2015-03-03' }, value: { amount: 120 }, dates: [{ kind: 'other', date: dayFromToday(5) }] },
  ];
  for (const [i, input] of rows.entries()) {
    const t = await createThing(input);
    await Thing.collection.updateOne({ _id: new Thing.base.Types.ObjectId(t.id) }, { $set: { createdAt: new Date(Date.UTC(2026, 0, 1 + i)) } });
  }
}, 60000);

const sorted = (sort, sortDir) => names({}, { sort, sortDir });

const EXPECTED = {
  name: { asc: ['The Anchor', 'Bike', 'Kayak', 'Mower', 'Zodiac'], desc: ['Zodiac', 'Mower', 'Kayak', 'Bike', 'The Anchor'] },
  recentlyAdded: { asc: ['Zodiac', 'The Anchor', 'Mower', 'Kayak', 'Bike'], desc: ['Bike', 'Kayak', 'Mower', 'The Anchor', 'Zodiac'] },
  acquired: { asc: ['Bike', 'Mower', 'Zodiac', 'Kayak', 'The Anchor'], desc: ['Kayak', 'Zodiac', 'Mower', 'Bike', 'The Anchor'] },
  value: { asc: ['The Anchor', 'Bike', 'Zodiac', 'Kayak', 'Mower'], desc: ['Kayak', 'Zodiac', 'Bike', 'The Anchor', 'Mower'] },
  nextDue: { asc: ['Mower', 'Bike', 'Zodiac', 'Kayak', 'The Anchor'], desc: ['Kayak', 'Zodiac', 'Bike', 'Mower', 'The Anchor'] },
};

test('every advertised sort except random has an order test here', () => {
  expect(Object.keys(EXPECTED).sort()).toEqual(THING_SORTS.filter((s) => s !== 'random').sort());
});

describe.each(Object.entries(EXPECTED))('sort %s', (sort, dirs) => {
  test('asc', async () => expect(await sorted(sort, 'asc')).toEqual(dirs.asc));
  test('desc (nulls still last)', async () => expect(await sorted(sort, 'desc')).toEqual(dirs.desc));
});

test('default sort is name asc; sortDir is case-insensitive', async () => {
  expect(await names()).toEqual(EXPECTED.name.asc);
  expect(await sorted('value', 'DESC')).toEqual(EXPECTED.value.desc);
});

describe('random', () => {
  const page = async (seed, p, limit) => (await ok(THINGS, { sort: 'random', seed, page: p, limit })).things.things.map((t) => t.name);

  test('same seed → same order, and pages of it tile the whole order', async () => {
    const all = await page(7, 1, 100);
    expect(all.slice().sort()).toEqual(EXPECTED.name.asc.slice().sort());
    expect(await page(7, 1, 100)).toEqual(all);
    const tiled = [...(await page(7, 1, 2)), ...(await page(7, 2, 2)), ...(await page(7, 3, 2))];
    expect(tiled).toEqual(all);
  });

  test('different seeds shuffle differently', async () => {
    const orders = new Set();
    for (const seed of [1, 2, 3, 4, 5, 6]) orders.add((await page(seed, 1, 100)).join('|'));
    expect(orders.size).toBeGreaterThan(1);
  });
});

test('paging reports total and pages', async () => {
  const data = await ok(THINGS, { page: 2, limit: 2 });
  expect(data.things).toMatchObject({ total: 5, page: 2, pages: 3 });
  expect(data.things.things.map((t) => t.name)).toEqual(['Kayak', 'Mower']);
});

test('an unknown sort or direction is a validation error, not a fallback', async () => {
  expect(await errorCode(THINGS, { sort: 'price' })).toBe('BAD_USER_INPUT');
  expect(await errorCode(THINGS, { sortDir: 'sideways' })).toBe('BAD_USER_INPUT');
});
