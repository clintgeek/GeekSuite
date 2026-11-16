/**
 * flockgeekLastEggProduction.test.js
 *
 * `lastEggProduction(locationId)` replaces the harvest sheet's "download every
 * egg record and sort it in the browser" (SUITE_REVIEW_2026-11, FlockGeek 1).
 * It must answer with the newest harvest DATE (not the newest insert), stay
 * inside the location and the owner, skip soft-deleted rows, and read at most
 * one document.
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const { default: EggProduction } = await import('../graphql/flockgeek/models/EggProduction.js');
const { resolvers } = await import('../graphql/flockgeek/resolvers.js');
const { typeDefs } = await import('../graphql/flockgeek/typeDefs.js');

const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const COOP = new mongoose.Types.ObjectId();
const PEN = new mongoose.Types.ObjectId();
const ctx = (userId) => (userId ? { user: { id: userId } } : {});
const { Query } = resolvers;

const day = (iso) => new Date(`${iso}T00:00:00.000Z`);
const egg = (overrides) =>
  EggProduction.create({ ownerId: ALICE, locationId: COOP, eggsCount: 3, date: day('2026-11-01'), ...overrides });

beforeAll(async () => {
  await EggProduction.db.asPromise();
}, 60000);

afterEach(async () => {
  await EggProduction.deleteMany({});
});

afterAll(async () => {
  await EggProduction.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('lastEggProduction', () => {
  test('is in the schema as an optional-argument, nullable query (additive)', () => {
    const sdl = typeof typeDefs === 'string' ? typeDefs : typeDefs.loc.source.body;
    expect(sdl).toMatch(/lastEggProduction\(locationId: ID\): EggProduction\n/);
  });

  test('answers the newest harvest date for the location, not the newest insert', async () => {
    await egg({ date: day('2026-11-10'), eggsCount: 7 });
    await egg({ date: day('2026-11-03'), eggsCount: 2 }); // inserted later, older day
    await egg({ locationId: PEN, date: day('2026-11-14'), eggsCount: 9 }); // other location

    const last = await Query.lastEggProduction(null, { locationId: String(COOP) }, ctx(ALICE));
    expect(last.eggsCount).toBe(7);
    expect(last.date.toISOString()).toBe('2026-11-10T00:00:00.000Z');
  });

  test('without a location it answers the newest across all locations', async () => {
    await egg({ date: day('2026-11-10') });
    await egg({ locationId: PEN, date: day('2026-11-14'), eggsCount: 9 });
    const last = await Query.lastEggProduction(null, {}, ctx(ALICE));
    expect(last.eggsCount).toBe(9);
  });

  test('skips soft-deleted rows and other owners; null when nothing is left', async () => {
    await egg({ date: day('2026-11-12'), eggsCount: 5, deletedAt: new Date() });
    await egg({ ownerId: BOB, date: day('2026-11-13'), eggsCount: 6 });
    await egg({ date: day('2026-11-02'), eggsCount: 1 });

    const last = await Query.lastEggProduction(null, { locationId: String(COOP) }, ctx(ALICE));
    expect(last.eggsCount).toBe(1);
    expect(await Query.lastEggProduction(null, { locationId: String(PEN) }, ctx(ALICE))).toBeNull();
  });

  test('refuses anonymous callers and junk ids', async () => {
    await expect(Query.lastEggProduction(null, {}, ctx(null))).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
    await expect(Query.lastEggProduction(null, { locationId: 'nope' }, ctx(ALICE))).rejects.toThrow(/Invalid ID/);
  });

  test('reads one document, not the whole log', async () => {
    for (let i = 1; i <= 20; i += 1) await egg({ date: day(`2026-10-${String(i).padStart(2, '0')}`) });
    const spy = jest.spyOn(EggProduction, 'findOne');
    const findSpy = jest.spyOn(EggProduction, 'find');
    await Query.lastEggProduction(null, { locationId: String(COOP) }, ctx(ALICE));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(findSpy).not.toHaveBeenCalled();
    spy.mockRestore();
    findSpy.mockRestore();
  });
});
