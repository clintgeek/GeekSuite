/**
 * src/seed/seed.js — insert-if-absent by slug; never clobbers.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runSeed } from '../src/seed/seed.js';
import { PLACES, SOURCES } from '../src/seed/data.js';
import { startMongo, stopMongo, clearAll } from './helpers/mongo.js';

let Place;
let Source;
before(async () => { ({ Place, Source } = await startMongo()); });
after(stopMongo);
beforeEach(clearAll);

describe('first run', () => {
  test('every place and source inserted; parents and places wired by id', async () => {
    const out = await runSeed({ Place, Source });
    assert.equal(out.placesInserted, PLACES.length);
    assert.equal(out.sourcesInserted, SOURCES.length);

    const bySlug = Object.fromEntries((await Place.find().lean()).map((p) => [p.slug, p]));
    assert.equal(String(bySlug['malvern-ar'].parentId), String(bySlug['hot-spring-county-ar']._id));
    assert.equal(String(bySlug['hot-spring-county-ar'].parentId), String(bySlug.arkansas._id));
    assert.equal(String(bySlug.arkansas.parentId), String(bySlug.us._id));
    assert.equal(bySlug.us.parentId, null);
    assert.equal(bySlug['clark-county-ar'].fips, '05019');
    assert.equal(bySlug['hot-spring-county-ar'].fips, '05059');
    assert.equal(bySlug['garland-county-ar'].fips, '05051');
    // The city and the county are distinct places in distinct counties.
    assert.equal(String(bySlug['hot-springs-ar'].parentId), String(bySlug['garland-county-ar']._id));

    const mdr = await Source.findOne({ slug: 'malvern-daily-record' }).lean();
    assert.equal(mdr.status, 'active');
    assert.deepEqual(mdr.feeds.map((f) => [f.url, f.pollEveryMin]), [['https://www.malvern-online.com/search/?f=rss&t=article&l=50', 60]]);
    assert.ok(mdr.feeds[0]._id, 'feed subdocuments get ids (the worker targets them)');
    assert.deepEqual(mdr.places.map(String).sort(), [String(bySlug['hot-spring-county-ar']._id), String(bySlug['malvern-ar']._id)].sort());

    const nws = await Source.findOne({ slug: 'nws-alerts' }).lean();
    assert.equal(nws.kind, 'official');
    assert.equal(nws.feeds[0].format, 'nws');
    assert.equal(nws.feeds[0].url, 'https://api.weather.gov/alerts/active?zone=ARC019,ARC059,ARZ053,ARZ054');

    for (const agg of await Source.find({ kind: 'aggregator' }).lean()) {
      assert.ok(agg.blockedDomains.includes('legacy.com'), agg.slug);
      assert.equal(agg.access.content, 'title');
    }
    assert.equal((await Source.findOne({ slug: 'hacker-news' }).lean()).access.content, 'title');
  });

  test('the plan\'s "No working feed" list is not seeded', async () => {
    await runSeed({ Place, Source });
    const all = (await Source.find({}, { homepage: 1, feeds: 1 }).lean()).flatMap((s) => [s.homepage, ...s.feeds.map((f) => f.url)]).join(' ');
    for (const gone of ['hsu.edu', 'obu.edu', 'axios.com', 'tailgate', 'clarkcountyar', 'hotspringcounty']) {
      assert.ok(!all.toLowerCase().includes(gone), gone);
    }
  });
});

describe('re-runs never clobber', () => {
  test('second run inserts nothing', async () => {
    await runSeed({ Place, Source });
    const again = await runSeed({ Place, Source });
    assert.equal(again.placesInserted, 0);
    assert.equal(again.sourcesInserted, 0);
    assert.equal(await Place.countDocuments(), PLACES.length);
    assert.equal(await Source.countDocuments(), SOURCES.length);
  });

  test('poll state, status and admin edits survive a re-seed; a removed feed is not re-added', async () => {
    await runSeed({ Place, Source });
    const src = await Source.findOne({ slug: 'npr' });
    const at = new Date('2026-10-10T12:00:00Z');
    src.feeds[0].etag = 'W/"abc"';
    src.feeds[0].lastOkAt = at;
    src.feeds[0].consecutiveFailures = 3;
    src.feeds.pull(src.feeds[2]._id); // an admin removed the world feed
    src.status = 'retired';
    src.notes = 'admin note';
    await src.save();
    await Place.updateOne({ slug: 'malvern-ar' }, { $set: { aliases: ['Malvern, Ark.'] } });

    await runSeed({ Place, Source });
    const after2 = await Source.findOne({ slug: 'npr' }).lean();
    assert.equal(after2.status, 'retired');
    assert.equal(after2.notes, 'admin note');
    assert.equal(after2.feeds.length, 2);
    assert.equal(after2.feeds[0].etag, 'W/"abc"');
    assert.equal(after2.feeds[0].consecutiveFailures, 3);
    assert.equal(after2.feeds[0].lastOkAt.toISOString(), at.toISOString());
    assert.deepEqual((await Place.findOne({ slug: 'malvern-ar' }).lean()).aliases, ['Malvern, Ark.']);
  });

  test('a deleted source is restored on the next seed (insert-if-absent)', async () => {
    await runSeed({ Place, Source });
    await Source.deleteOne({ slug: 'kark' });
    const out = await runSeed({ Place, Source });
    assert.equal(out.sourcesInserted, 1);
    assert.ok(await Source.exists({ slug: 'kark' }));
  });

  test('two concurrent seeds never duplicate a slug', async () => {
    await Promise.all([runSeed({ Place, Source }), runSeed({ Place, Source })]);
    assert.equal(await Place.countDocuments(), PLACES.length);
    assert.equal(await Source.countDocuments(), SOURCES.length);
  });
});
