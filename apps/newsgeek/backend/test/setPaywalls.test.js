/**
 * src/seed/setPaywalls.js (scripts/set-paywalls.js) — exactly the listed
 * slugs, exactly access.paywall, idempotent, and --dry-run writes nothing.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setPaywalls } from '../src/seed/setPaywalls.js';
import { PAYWALL_BY_SLUG, SOURCES } from '../src/seed/data.js';
import { runSeed } from '../src/seed/seed.js';
import { startMongo, stopMongo, clearAll } from './helpers/mongo.js';

let Place;
let Source;
before(async () => { ({ Place, Source } = await startMongo()); });
after(stopMongo);
beforeEach(clearAll);

/** An "existing production DB": seeded before the paywall levels were known (every source 'none'). */
async function seedAsBefore() {
  const sources = SOURCES.map((s) => ({ ...s, access: { ...s.access, paywall: 'none' } }));
  await runSeed({ Place, Source, data: { sources } });
}
const snapshot = async () => Object.fromEntries((await Source.collection.find({}).toArray()).map((s) => [s.slug, s]));

describe('set-paywalls', () => {
  test('the map is the five confirmed sources', () => {
    assert.deepEqual(PAYWALL_BY_SLUG, {
      'malvern-daily-record': 'hard',
      'sentinel-record': 'hard',
      'arkansas-democrat-gazette': 'hard',
      'the-verge': 'metered',
      'bbc-world': 'metered',
    });
    for (const slug of Object.keys(PAYWALL_BY_SLUG)) {
      assert.equal(SOURCES.find((s) => s.slug === slug).access.paywall, PAYWALL_BY_SLUG[slug], `seed data agrees for ${slug}`);
    }
    assert.equal(SOURCES.filter((s) => s.access.paywall !== 'none').length, 5, 'nothing else in the seed is paywalled');
  });

  test('sets exactly access.paywall on exactly those slugs, reporting old → new', async () => {
    await seedAsBefore();
    const beforeRows = await snapshot();
    const report = await setPaywalls({ Source });
    assert.deepEqual(
      report.map((r) => [r.slug, r.from, r.to, r.action]).sort(),
      Object.entries(PAYWALL_BY_SLUG).map(([slug, to]) => [slug, 'none', to, 'set']).sort(),
    );
    const afterRows = await snapshot();
    for (const [slug, row] of Object.entries(afterRows)) {
      const was = beforeRows[slug];
      const expected = PAYWALL_BY_SLUG[slug] ?? 'none';
      assert.equal(row.access.paywall, expected, slug);
      // Nothing else on the document moved (content level, feeds, timestamps…).
      const strip = (d) => ({ ...d, access: { ...d.access, paywall: null } });
      assert.deepEqual(strip(row), strip(was), `${slug} otherwise untouched`);
    }
  });

  test('is idempotent: a second run reports unchanged and writes nothing', async () => {
    await seedAsBefore();
    await setPaywalls({ Source });
    const mid = await snapshot();
    const report = await setPaywalls({ Source });
    assert.ok(report.every((r) => r.action === 'unchanged'), JSON.stringify(report));
    assert.deepEqual(await snapshot(), mid);
  });

  test('--dry-run reports would-set and writes nothing', async () => {
    await seedAsBefore();
    const beforeRows = await snapshot();
    const report = await setPaywalls({ Source, dryRun: true });
    assert.ok(report.every((r) => r.action === 'would-set' && r.from === 'none'), JSON.stringify(report));
    assert.deepEqual(await snapshot(), beforeRows);
  });

  test('a slug missing from the database is reported, never created', async () => {
    await seedAsBefore();
    await Source.deleteOne({ slug: 'the-verge' });
    const count = await Source.countDocuments({});
    const report = await setPaywalls({ Source });
    assert.deepEqual(report.find((r) => r.slug === 'the-verge'), { slug: 'the-verge', from: null, to: 'metered', action: 'missing' });
    assert.equal(await Source.countDocuments({}), count);
  });
});
