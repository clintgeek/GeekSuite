import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orientationFor, fetchBackdrops, loadBackdrop } from './index.js';

const BASE = 'https://basegeek.example';
const manifest = (photos) => async () => ({ ok: true, json: async () => ({ batchId: 'b', photos }) });
const photo = (id) => ({ id, source: 'bing', credit: `c${id}`, landscape: `/api/backdrops/${id}/landscape.jpg`, portrait: `/api/backdrops/${id}/portrait.jpg` });

/** An Image stand-in that fails for any URL in `bad`. */
const fakeImage = (bad = []) => class {
  set src(url) { queueMicrotask(() => (bad.some((b) => url.includes(b)) ? this.onerror() : this.onload())); }
};

test('orientationFor', () => {
  assert.equal(orientationFor(390, 844), 'portrait');
  assert.equal(orientationFor(1920, 1080), 'landscape');
  assert.equal(orientationFor(800, 800), 'landscape');
});

test('fetchBackdrops returns [] when the service is down or odd', async () => {
  assert.deepEqual(await fetchBackdrops(BASE, { fetchImpl: async () => { throw new Error('down'); } }), []);
  assert.deepEqual(await fetchBackdrops(BASE, { fetchImpl: async () => ({ ok: false }) }), []);
  assert.deepEqual(await fetchBackdrops(BASE, { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), []);
});

test('loadBackdrop picks the crop for the viewport and resolves an absolute URL', async () => {
  const got = await loadBackdrop({ base: BASE, width: 390, height: 844, fetchImpl: manifest([photo('a')]), ImageCtor: fakeImage(), random: () => 0 });
  assert.deepEqual(got, { url: `${BASE}/api/backdrops/a/portrait.jpg`, credit: 'ca', source: 'bing', orientation: 'portrait' });
});

test('loadBackdrop tries another photo when one fails to load', async () => {
  const got = await loadBackdrop({ base: BASE, width: 1920, height: 1080, fetchImpl: manifest([photo('a'), photo('b')]), ImageCtor: fakeImage(['/a/']), random: () => 0 });
  assert.equal(got.url, `${BASE}/api/backdrops/b/landscape.jpg`);
});

test('loadBackdrop resolves null when nothing loads or nothing is there', async () => {
  assert.equal(await loadBackdrop({ base: BASE, fetchImpl: manifest([]), ImageCtor: fakeImage() }), null);
  assert.equal(await loadBackdrop({ base: BASE, width: 1, height: 1, fetchImpl: manifest([photo('a')]), ImageCtor: fakeImage(['/a/']) }), null);
});
