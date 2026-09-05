/**
 * appRegistrySeed.test.js — the app-registry auto-seed extracted out of
 * routes/apps.js so the same function can run both from `POST /api/apps/seed`
 * and automatically at boot (server.js).
 *
 * Two things must hold:
 *   1. Seeding twice creates the defaults exactly once — the second pass
 *      skips every row it created the first time.
 *   2. An existing row is never overwritten, even when its `url` (or any
 *      other field) has been customized away from the default — this runs
 *      on every boot, so clobbering a hand-edited row would be a silent,
 *      recurring data-loss bug.
 *
 * Mongo is the in-memory instance from globalSetup. The App model rides the
 * default mongoose connection (see adminGates.test.js), which setEnv.js
 * points at this run's mongod via MONGODB_URI.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';

const { default: mongoose } = await import('mongoose');
const { default: App } = await import('../models/App.js');
const { seedMissingApps, DEFAULT_APPS } = await import('../services/appRegistrySeed.js');

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }
}, 60000);

afterEach(async () => {
  await App.deleteMany({});
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('seedMissingApps', () => {
  it('creates every default once; seeding again creates none', async () => {
    const first = await seedMissingApps();
    expect(first).toEqual({ created: DEFAULT_APPS.length, skipped: 0 });
    expect(await App.countDocuments({})).toBe(DEFAULT_APPS.length);

    const second = await seedMissingApps();
    expect(second).toEqual({ created: 0, skipped: DEFAULT_APPS.length });
    expect(await App.countDocuments({})).toBe(DEFAULT_APPS.length);
  });

  it('does not overwrite an existing row with a custom url', async () => {
    await App.create({
      name: 'bookgeek',
      displayName: 'bookGeek (custom)',
      url: 'https://custom.example.com/bookgeek',
    });

    const result = await seedMissingApps();
    expect(result.created).toBe(DEFAULT_APPS.length - 1);
    expect(result.skipped).toBe(1);

    const doc = await App.findOne({ name: 'bookgeek' });
    expect(doc.url).toBe('https://custom.example.com/bookgeek');
    expect(doc.displayName).toBe('bookGeek (custom)');
  });

  it('includes bookgeek and startgeek exactly as documented', () => {
    expect(DEFAULT_APPS.find((a) => a.name === 'bookgeek')).toMatchObject({
      displayName: 'bookGeek',
      url: 'https://bookgeek.clintgeek.com',
    });
    expect(DEFAULT_APPS.find((a) => a.name === 'startgeek')).toMatchObject({
      displayName: 'startGeek',
      url: 'https://start.clintgeek.com',
      healthEndpoint: '/',
    });
  });
});
