/**
 * backdrops.test.js — the wallpaper batch job and its public routes
 * (DOCS/BACKDROP_SERVICE_PLAN.md). No network, no database: sources,
 * downloader, clock and collections are injected.
 *
 * What matters here is the failure behaviour, because that is why the service
 * exists: one dead source must not empty a batch, a thin day must not replace
 * a good batch, and the routes must hand out exactly one batch.
 */

import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const { BackdropJob, interleave } = await import('../services/backdropJob.js');
const { createBackdropRouter } = await import('../routes/backdrops.js');
const { bing, picsum, loremflickr } = await import('../services/backdropSources.js');

const HOUR = 60 * 60 * 1000;
const silent = { info() {}, warn() {}, error() {} };

/** A source that offers `n` candidates, or throws when `down`. */
const source = (id, { down = false } = {}) => ({
  id,
  async candidates(n) {
    if (down) throw new Error('522');
    return Array.from({ length: n }, (_, i) => ({
      source: id,
      sourceId: `${id}${i}`,
      credit: id,
      urls: { landscape: `https://${id}/${i}/l`, portrait: `https://${id}/${i}/p` },
    }));
  },
});

const okDownload = async () => ({ data: Buffer.alloc(30_000), contentType: 'image/jpeg' });

function fakePhotos(seed = []) {
  let docs = [...seed];
  return {
    get docs() { return docs; },
    countDocuments: async () => docs.length,
    insertMany: async (rows) => { docs.push(...rows); },
    deleteMany: async ({ batchId }) => { docs = docs.filter((d) => d.batchId === batchId.$ne); },
  };
}

function fakeRuns(seed = []) {
  const docs = [...seed];
  return {
    docs,
    create: async (doc) => { docs.push(doc); },
    findOne: (filter) => ({
      sort() { return this; },
      lean: async () => docs
        .filter((d) => !filter?.replaced || d.replaced)
        .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0] ?? null,
    }),
  };
}

const makeJob = (over = {}) => new BackdropJob({
  now: () => Date.parse('2026-11-13T12:00:00Z'),
  sources: [source('bing'), source('picsum'), source('loremflickr')],
  download: okDownload,
  Photos: fakePhotos(),
  Runs: fakeRuns(),
  log: silent,
  ...over,
});

describe('interleave', () => {
  it('alternates sources and keeps the tail of the longest', () => {
    expect(interleave([['a0', 'a1'], ['b0'], ['c0', 'c1', 'c2']]))
      .toEqual(['a0', 'b0', 'c0', 'a1', 'c1', 'c2']);
  });
});

describe('BackdropJob.refresh', () => {
  it('builds a mixed batch of 10 across the sources', async () => {
    const job = makeJob();
    const run = await job.refresh();
    expect(run.replaced).toBe(true);
    expect(job.Photos.docs).toHaveLength(10);
    const bySource = job.Photos.docs.reduce((m, d) => ({ ...m, [d.source]: (m[d.source] || 0) + 1 }), {});
    expect(bySource).toEqual({ bing: 4, picsum: 3, loremflickr: 3 });
  });

  it('fills from the live sources when one is down (the 2026-11-13 outage)', async () => {
    const job = makeJob({ sources: [source('bing'), source('picsum', { down: true }), source('loremflickr', { down: true })] });
    const run = await job.refresh();
    expect(run.replaced).toBe(true);
    expect(job.Photos.docs).toHaveLength(10);
    expect(job.Photos.docs.every((d) => d.source === 'bing')).toBe(true);
    expect(run.perSource.picsum.error).toMatch(/522/);
  });

  it('skips a photo whose download fails and keeps going', async () => {
    const download = async (url) => {
      if (url.includes('picsum/0')) throw new Error('HTTP 500');
      return okDownload();
    };
    const job = makeJob({ download });
    const run = await job.refresh();
    expect(job.Photos.docs).toHaveLength(10);
    expect(job.Photos.docs.some((d) => d.sourceId === 'picsum0')).toBe(false);
    expect(run.perSource.picsum.error).toBe('HTTP 500');
  });

  it('keeps the current batch when too few photos arrive', async () => {
    const old = { batchId: 'old', source: 'bing' };
    const Photos = fakePhotos([old, { ...old }, { ...old }]);
    const job = makeJob({ Photos, sources: [source('bing', { down: true }), source('picsum', { down: true }), source('loremflickr', { down: true })] });
    const run = await job.refresh();
    expect(run.replaced).toBe(false);
    expect(run.error).toMatch(/kept the current batch/);
    expect(Photos.docs.map((d) => d.batchId)).toEqual(['old', 'old', 'old']);
    expect(job.Runs.docs).toHaveLength(1); // a failed attempt is still recorded
  });

  it('replaces the old batch only after the new one is written', async () => {
    const Photos = fakePhotos([{ batchId: 'old' }]);
    const job = makeJob({ Photos });
    const run = await job.refresh();
    expect(Photos.docs.every((d) => d.batchId === run.batchId)).toBe(true);
  });
});

describe('BackdropJob schedule', () => {
  const at = (iso) => () => Date.parse(iso);

  it('is due when there is no batch', async () => {
    expect(await makeJob().isDue()).toBe(true);
  });

  it('is not due within 48 h of the last batch that landed', async () => {
    const Runs = fakeRuns([{ startedAt: new Date('2026-11-12T12:00:00Z'), replaced: true }]);
    const job = makeJob({ Runs, Photos: fakePhotos([{ batchId: 'b' }]) });
    expect(await job.isDue()).toBe(false);
  });

  it('is due after 48 h, and failed runs in between do not reset the clock', async () => {
    const Runs = fakeRuns([
      { startedAt: new Date('2026-11-11T11:00:00Z'), replaced: true },
      { startedAt: new Date('2026-11-13T11:00:00Z'), replaced: false },
    ]);
    const job = makeJob({ Runs, Photos: fakePhotos([{ batchId: 'b' }]), now: at('2026-11-13T12:00:00Z') });
    expect(await job.isDue()).toBe(true);
  });

  it('tick does nothing when not due', async () => {
    const Runs = fakeRuns([{ startedAt: new Date('2026-11-13T00:00:00Z'), replaced: true }]);
    const job = makeJob({ Runs, Photos: fakePhotos([{ batchId: 'b' }]) });
    expect(await job.tick()).toBeNull();
    expect(Runs.docs).toHaveLength(1);
  });
});

describe('sources', () => {
  const jsonFetch = (body) => async () => ({ ok: true, json: async () => body });

  it('bing builds landscape and portrait crops of the same image', async () => {
    const [c] = await bing.candidates(1, { fetchImpl: jsonFetch({ images: [{ urlbase: '/th?id=OHR.X', copyright: 'Somewhere (© Someone)', hsh: 'h1' }] }) });
    expect(c.urls.landscape).toBe('https://www.bing.com/th?id=OHR.X_1920x1080.jpg');
    expect(c.urls.portrait).toBe('https://www.bing.com/th?id=OHR.X_1080x1920.jpg');
    expect(c.credit).toBe('Somewhere (© Someone)');
  });

  it('picsum crops one id both ways and skips portrait originals', async () => {
    const list = [{ id: '7', author: 'A', width: 4000, height: 3000 }, { id: '8', author: 'B', width: 2000, height: 3000 }];
    const out = await picsum.candidates(5, { fetchImpl: jsonFetch(list), random: () => 0 });
    expect(out.map((c) => c.sourceId)).toEqual(['7']);
    expect(out[0].urls.portrait).toBe('https://picsum.photos/id/7/1080/1920.jpg');
  });

  it('loremflickr pins one lock across both crops', async () => {
    const [c] = await loremflickr.candidates(1, { random: () => 0.5 });
    const lock = c.urls.landscape.split('lock=')[1];
    expect(c.urls.portrait.endsWith(`lock=${lock}`)).toBe(true);
  });
});

describe('/api/backdrops', () => {
  const id1 = new mongoose.Types.ObjectId();
  const id2 = new mongoose.Types.ObjectId();
  const idOld = new mongoose.Types.ObjectId();
  const docs = [
    { _id: id1, batchId: 'new', source: 'bing', credit: 'c1', createdAt: new Date('2026-11-13'), landscape: { data: Buffer.from('L1'), contentType: 'image/jpeg' } },
    { _id: id2, batchId: 'new', source: 'picsum', credit: 'c2', createdAt: new Date('2026-11-13') },
    { _id: idOld, batchId: 'old', source: 'bing', credit: 'c0', createdAt: new Date('2026-11-11') },
  ];
  const Photos = {
    find: () => ({ sort: () => ({ lean: async () => [...docs].sort((a, b) => b.createdAt - a.createdAt) }) }),
    findById: (id) => ({ lean: async () => docs.find((d) => String(d._id) === String(id)) ?? null }),
  };
  const app = express();
  app.use('/api/backdrops', createBackdropRouter({ Photos }));

  it('lists only the newest batch, with paths for both crops', async () => {
    const res = await request(app).get('/api/backdrops');
    expect(res.status).toBe(200);
    expect(res.body.batchId).toBe('new');
    expect(res.body.photos.map((p) => p.id)).toEqual([String(id1), String(id2)]);
    expect(res.body.photos[0].portrait).toBe(`/api/backdrops/${id1}/portrait.jpg`);
    expect(res.headers['cache-control']).toMatch(/max-age=300/);
  });

  it('serves the bytes as an immutable image', async () => {
    const res = await request(app).get(`/api/backdrops/${id1}/landscape.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    expect(res.headers['cache-control']).toMatch(/immutable/);
    expect(res.body.toString()).toBe('L1');
  });

  it('404s an unknown variant, a bad id, and a missing photo', async () => {
    expect((await request(app).get(`/api/backdrops/${id1}/square.jpg`)).status).toBe(404);
    expect((await request(app).get('/api/backdrops/not-an-id/landscape.jpg')).status).toBe(404);
    expect((await request(app).get(`/api/backdrops/${new mongoose.Types.ObjectId()}/landscape.jpg`)).status).toBe(404);
    expect((await request(app).get(`/api/backdrops/${id2}/landscape.jpg`)).status).toBe(404);
  });
});
