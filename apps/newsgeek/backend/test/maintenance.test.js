/**
 * The 2026-10-11 one-off scripts' logic: set-path-rules (exact slugs, one
 * field, idempotent, dry run), purge-path-excluded (dry by default, scoped
 * to each article's own source), clean-excerpts (dry by default, only
 * `excerpt`, idempotent). And the seed carries the path rules + new sources.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { setPathRules } from '../src/seed/setPathRules.js';
import { PATH_RULES_BY_SLUG } from '../src/seed/pathRules.js';
import { purgePathExcluded } from '../src/maintenance/purgePathExcluded.js';
import { cleanExcerpts } from '../src/maintenance/cleanExcerpts.js';
import { runSeed } from '../src/seed/seed.js';
import { SOURCES } from '../src/seed/data.js';
import { startMongo, stopMongo, clearAll } from './helpers/mongo.js';

let Place;
let Source;
let Article;
before(async () => { ({ Place, Source, Article } = await startMongo()); });
after(stopMongo);
beforeEach(clearAll);

const BLOX = ['^/online_features/', '/press_releases/', '^/news/(national|world|nation)/', '^/ap/'];

/** An "existing production DB": seeded before path rules existed. */
async function seedAsBefore() {
  const sources = SOURCES.map(({ pathExclude: _rules, ...s }) => s);
  await runSeed({ Place, Source, data: { sources } });
}
const snapshot = async () => Object.fromEntries((await Source.collection.find({}).toArray()).map((s) => [s.slug, s]));

describe('seed', () => {
  test('fresh installs get the path rules and the 2026-10-11 sources', async () => {
    await runSeed({ Place, Source });
    for (const slug of ['malvern-daily-record', 'saline-courier', 'ashley-county-ledger', 'log-cabin-democrat', 'magnolia-reporter', 'ktbs']) {
      assert.deepEqual((await Source.findOne({ slug }).lean()).pathExclude, BLOX, slug);
    }
    assert.deepEqual((await Source.findOne({ slug: 'guardian-us' }).lean()).pathExclude, ['^/sport/', '^/football/']);
    assert.deepEqual((await Source.findOne({ slug: 'arkadelphian' }).lean()).pathExclude, []);

    const geo = await Source.find({ slug: /^gnews-geo-/ }).lean();
    assert.equal(geo.length, 4);
    for (const g of geo) {
      assert.equal(g.kind, 'aggregator');
      assert.deepEqual(g.sections, ['local']);
      assert.equal(g.feeds[0].pollEveryMin, 60);
      assert.match(g.feeds[0].url, /^https:\/\/news\.google\.com\/rss\/topics\/CAAq[\w-]+\?hl=en-US&gl=US&ceid=US:en$/);
      assert.equal(g.places.length, 2);
      assert.deepEqual(g.blockedDomains, ['weather.com']);
    }
    const bySlug = async (slug) => Source.findOne({ slug }).lean();
    assert.equal((await bySlug('texarkana-today')).access.paywall, 'none');
    assert.equal((await bySlug('camden-news')).access.paywall, 'hard');
    assert.equal((await bySlug('el-dorado-news-times')).access.paywall, 'hard');
    assert.equal((await bySlug('el-dorado-news-times')).places.length, 2);
  });
});

describe('set-path-rules', () => {
  test('the map names exactly the six Blox papers and the Guardian', () => {
    assert.deepEqual(Object.keys(PATH_RULES_BY_SLUG).sort(), ['ashley-county-ledger', 'guardian-us', 'ktbs', 'log-cabin-democrat', 'magnolia-reporter', 'malvern-daily-record', 'saline-courier']);
  });

  test('sets exactly pathExclude on exactly those slugs, reporting old → new', async () => {
    await seedAsBefore();
    const beforeRows = await snapshot();
    const report = await setPathRules({ Source });
    assert.deepEqual(report.map((r) => [r.slug, r.action]).sort(), Object.keys(PATH_RULES_BY_SLUG).map((s) => [s, 'set']).sort());
    assert.ok(report.every((r) => r.from.length === 0));
    const afterRows = await snapshot();
    for (const [slug, row] of Object.entries(afterRows)) {
      assert.deepEqual(row.pathExclude, PATH_RULES_BY_SLUG[slug] ?? [], slug);
      const strip = ({ pathExclude: _rules, ...d }) => d;
      assert.deepEqual(strip(row), strip(beforeRows[slug]), `${slug} otherwise untouched`);
    }
  });

  test('idempotent; --dry-run writes nothing; a missing slug is reported, never created', async () => {
    await seedAsBefore();
    const pristine = await snapshot();
    const dry = await setPathRules({ Source, dryRun: true });
    assert.ok(dry.every((r) => r.action === 'would-set'), JSON.stringify(dry));
    assert.deepEqual(await snapshot(), pristine);

    await setPathRules({ Source });
    const mid = await snapshot();
    assert.ok((await setPathRules({ Source })).every((r) => r.action === 'unchanged'));
    assert.deepEqual(await snapshot(), mid);

    await Source.deleteOne({ slug: 'ktbs' });
    const n = await Source.countDocuments();
    const report = await setPathRules({ Source });
    assert.equal(report.find((r) => r.slug === 'ktbs').action, 'missing');
    assert.equal(await Source.countDocuments(), n);
  });
});

describe('purge-path-excluded', () => {
  let n = 0;
  const mkArticle = (sourceId, url) => {
    n += 1;
    return Article.create({
      sourceId, feedUrl: 'https://x.test/feed', guid: `g${n}`, url, canonicalUrl: url, title: `T${n}`, titleKey: `t${n}`,
      publisher: 'P', publishedAt: new Date(), fetchedAt: new Date(),
    });
  };

  async function fixture() {
    const ruled = await Source.create({ slug: 'mdr', name: 'MDR', kind: 'journalism', status: 'active', pathExclude: BLOX });
    const other = await Source.create({ slug: 'other', name: 'Other', kind: 'journalism', status: 'active' });
    await mkArticle(ruled._id, 'https://www.malvern-online.com/online_features/press_releases/a.html');
    await mkArticle(ruled._id, 'https://www.malvern-online.com/news/national/b.html');
    await mkArticle(ruled._id, 'https://www.malvern-online.com/news/local/c.html');
    // Another source's article with a matching path is NOT its rules' business.
    await mkArticle(other._id, 'https://other.test/online_features/press_releases/d.html');
    return { ruled, other };
  }

  test('dry run by default: counts per source, deletes nothing', async () => {
    await fixture();
    const rows = await purgePathExcluded({ Source, Article });
    assert.deepEqual(rows, [{ slug: 'mdr', rules: 4, scanned: 3, matched: 2, deleted: 0 }]);
    assert.equal(await Article.countDocuments(), 4);
  });

  test('apply deletes only the ruled source\'s matching articles; a second apply finds nothing', async () => {
    const { other } = await fixture();
    const rows = await purgePathExcluded({ Source, Article, apply: true });
    assert.equal(rows[0].deleted, 2);
    const left = (await Article.find().lean()).map((a) => new URL(a.url).pathname).sort();
    assert.deepEqual(left, ['/news/local/c.html', '/online_features/press_releases/d.html']);
    assert.equal(await Article.countDocuments({ sourceId: other._id }), 1);
    const again = await purgePathExcluded({ Source, Article, apply: true });
    assert.deepEqual(again.map((r) => [r.matched, r.deleted]), [[0, 0]]);
  });
});

describe('clean-excerpts', () => {
  const sid = new mongoose.Types.ObjectId();
  let n = 0;
  const mk = (excerpt) => {
    n += 1;
    return Article.create({
      sourceId: sid, feedUrl: 'f', guid: `c${n}`, url: `https://x.test/${n}`, canonicalUrl: `https://x.test/${n}`,
      title: `T${n}`, titleKey: `t${n}`, publisher: 'P', publishedAt: new Date(), fetchedAt: new Date(), excerpt,
    });
  };

  async function fixture() {
    await mk('Council met. The post Council meets appeared first on Arkansas Times.');
    await mk('Storm hit. Continue reading…');
    await mk('Go to the library where you can Read more');
    await mk('Plain excerpt.');
  }

  test('dry run by default: reports, writes nothing', async () => {
    await fixture();
    const before2 = (await Article.collection.find({}).toArray());
    const r = await cleanExcerpts({ Article });
    assert.equal(r.scanned, 3, 'the prefilter lets the "Read more" keep case through…');
    assert.equal(r.changed, 2, '…and the cleaner leaves it');
    assert.equal(r.written, 0);
    assert.equal(r.examples.length, 2);
    assert.deepEqual(await Article.collection.find({}).toArray(), before2);
  });

  test('apply writes only the excerpts that change, only that field; idempotent', async () => {
    await fixture();
    const beforeRows = new Map((await Article.collection.find({}).toArray()).map((a) => [a.guid, a]));
    const r = await cleanExcerpts({ Article, apply: true });
    assert.equal(r.written, 2);
    const rows = await Article.collection.find({}).sort({ guid: 1 }).toArray();
    assert.deepEqual(rows.map((a) => a.excerpt), ['Council met.', 'Storm hit.', 'Go to the library where you can Read more', 'Plain excerpt.']);
    for (const a of rows) {
      const { excerpt: _now, ...rest } = a;
      const { excerpt: _was, ...restWas } = beforeRows.get(a.guid);
      assert.deepEqual(rest, restWas, `${a.guid}: nothing else moved`);
    }
    const again = await cleanExcerpts({ Article, apply: true });
    assert.equal(again.changed, 0);
    assert.equal(again.written, 0);
  });
});
