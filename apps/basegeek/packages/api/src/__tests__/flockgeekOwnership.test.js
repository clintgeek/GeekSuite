/**
 * flockgeekOwnership.test.js
 *
 * FlockGeek data is strictly per-owner (every model carries `ownerId`; the
 * frontend has no sharing concept). GraphQL is mounted behind `optionalUser()`,
 * so an unauthenticated request still reaches these resolvers.
 *
 * Regression guard for the IDOR class: filters were built as
 * `{ ownerId: context.user?.id }`, and Mongoose *strips undefined keys out of
 * a filter*, so an anonymous caller got an unscoped query over every tenant's
 * birds, pairings, egg logs, etc. — reads AND writes.
 */

import mongoose from 'mongoose';

const { default: Bird } = await import('../graphql/flockgeek/models/Bird.js');
const { default: Pairing } = await import('../graphql/flockgeek/models/Pairing.js');
const { default: HatchEvent } = await import('../graphql/flockgeek/models/HatchEvent.js');
const { default: Group } = await import('../graphql/flockgeek/models/Group.js');
const { default: Location } = await import('../graphql/flockgeek/models/Location.js');
const { default: MeatRun } = await import('../graphql/flockgeek/models/MeatRun.js');
const { default: EggProduction } = await import('../graphql/flockgeek/models/EggProduction.js');
const { default: HealthRecord } = await import('../graphql/flockgeek/models/HealthRecord.js');
const { resolvers } = await import('../graphql/flockgeek/resolvers.js');

const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (userId) => (userId ? { user: { id: userId } } : {});

const { Query, Mutation } = resolvers;

const makeBird = (overrides = {}) =>
  Bird.create({ ownerId: ALICE, tagId: `A-${Math.random().toString(36).slice(2, 8)}`, name: 'Henrietta', ...overrides });

beforeAll(async () => {
  await Bird.db.asPromise();
}, 60000);

afterEach(async () => {
  await Promise.all(
    [Bird, Pairing, HatchEvent, Group, Location, MeatRun, EggProduction, HealthRecord].map((m) =>
      m.deleteMany({})
    )
  );
});

afterAll(async () => {
  await Bird.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('single-entity reads are owner-scoped', () => {
  test('bird is visible to its owner, invisible to everyone else', async () => {
    const bird = await makeBird();
    expect(await Query.bird(null, { id: String(bird._id) }, ctx(ALICE))).not.toBeNull();
    expect(await Query.bird(null, { id: String(bird._id) }, ctx(BOB))).toBeNull();
    expect(await Query.bird(null, { id: String(bird._id) }, ctx(null))).toBeNull();
  });

  test('pairing / hatchEvent / flockGroup / meatRun refuse anonymous and cross-user reads', async () => {
    const pairing = await Pairing.create({ ownerId: ALICE, name: 'Blue pen' });
    const hatch = await HatchEvent.create({
      ownerId: ALICE,
      pairingId: pairing._id,
      setDate: new Date(),
      eggsSet: 12,
    });
    const group = await Group.create({ ownerId: ALICE, name: 'Spring brood', startDate: new Date() });
    const run = await MeatRun.create({
      ownerId: ALICE,
      pairingId: pairing._id,
      startDate: new Date(),
      startCount: 20,
    });

    const cases = [
      [Query.pairing, pairing],
      [Query.hatchEvent, hatch],
      [Query.flockGroup, group],
      [Query.meatRun, run],
    ];

    for (const [resolver, doc] of cases) {
      expect(await resolver(null, { id: String(doc._id) }, ctx(ALICE))).not.toBeNull();
      expect(await resolver(null, { id: String(doc._id) }, ctx(BOB))).toBeNull();
      expect(await resolver(null, { id: String(doc._id) }, ctx(null))).toBeNull();
    }
  });

  test('anonymous list queries return nothing rather than every tenant', async () => {
    await makeBird();
    await Location.create({ ownerId: ALICE, name: 'Coop A', type: 'coop' });
    await EggProduction.create({ ownerId: ALICE, date: new Date(), eggsCount: 6 });

    expect(await Query.birds(null, {}, ctx(null))).toEqual([]);
    expect(await Query.flockLocations(null, {}, ctx(null))).toEqual([]);
    expect(await Query.eggProductions(null, {}, ctx(null))).toEqual([]);
    expect(await Query.hatchEvents(null, {}, ctx(null))).toEqual([]);
    expect(await Query.pairings(null, {}, ctx(null))).toEqual([]);
    expect(await Query.flockGroups(null, {}, ctx(null))).toEqual([]);
    expect(await Query.groupMemberships(null, {}, ctx(null))).toEqual([]);
    expect(await Query.meatRuns(null, {}, ctx(null))).toEqual([]);
    expect(await Query.flockEvents(null, {}, ctx(null))).toEqual([]);

    expect(await Query.birds(null, {}, ctx(BOB))).toHaveLength(0);
    expect(await Query.birds(null, {}, ctx(ALICE))).toHaveLength(1);
  });

  test('per-bird child reads are owner-scoped, not just bird-scoped', async () => {
    const bird = await makeBird();
    await HealthRecord.create({
      ownerId: ALICE,
      birdId: bird._id,
      eventDate: new Date(),
      type: 'checkup',
    });

    expect(await Query.healthRecords(null, { birdId: String(bird._id) }, ctx(ALICE))).toHaveLength(1);
    expect(await Query.healthRecords(null, { birdId: String(bird._id) }, ctx(BOB))).toHaveLength(0);
    expect(await Query.healthRecords(null, { birdId: String(bird._id) }, ctx(null))).toEqual([]);
    expect(await Query.birdTraits(null, { birdId: String(bird._id) }, ctx(null))).toEqual([]);
    expect(await Query.birdNotes(null, { birdId: String(bird._id) }, ctx(null))).toEqual([]);
  });
});

describe('writes require an owner and cannot cross tenants', () => {
  test('updateBird is rejected for another user and for anonymous callers', async () => {
    const bird = await makeBird();

    await expect(
      Mutation.updateBird(null, { id: String(bird._id), name: 'pwned' }, ctx(BOB))
    ).rejects.toThrow('Bird not found');
    await expect(
      Mutation.updateBird(null, { id: String(bird._id), name: 'pwned' }, ctx(null))
    ).rejects.toThrow('Unauthorized');

    expect((await Bird.findById(bird._id)).name).toBe('Henrietta');
  });

  test('every update mutation rejects an anonymous caller', async () => {
    const anyId = String(new mongoose.Types.ObjectId());
    const calls = [
      () => Mutation.updateEggProduction(null, { id: anyId, eggsCount: 99 }, ctx(null)),
      () => Mutation.updatePairing(null, { id: anyId, name: 'x' }, ctx(null)),
      () => Mutation.updateHatchEvent(null, { id: anyId, eggsSet: 1 }, ctx(null)),
      () => Mutation.updateMeatRun(null, { id: anyId, status: 'done' }, ctx(null)),
      () => Mutation.updateFlockGroup(null, { id: anyId, name: 'x' }, ctx(null)),
      () => Mutation.updateFlockLocation(null, { id: anyId, name: 'x' }, ctx(null)),
      () => Mutation.deleteFlockEntity(null, { type: 'bird', id: anyId }, ctx(null)),
      () => Mutation.createBird(null, { tagId: 'X-1' }, ctx(null)),
      () => Mutation.recordEggProduction(null, { date: new Date(), eggsCount: 1 }, ctx(null)),
      () => Mutation.addHealthRecord(null, { birdId: anyId, eventDate: new Date(), type: 'checkup' }, ctx(null)),
      () => Mutation.createFlockLocation(null, { name: 'x', type: 'coop' }, ctx(null)),
      () => Mutation.createFlockGroup(null, { name: 'x', startDate: new Date() }, ctx(null)),
      () => Mutation.createPairing(null, { name: 'x' }, ctx(null)),
      () => Mutation.recordHatchEvent(null, { setDate: new Date(), eggsSet: 1 }, ctx(null)),
      () => Mutation.createMeatRun(null, { pairingId: anyId, startDate: new Date(), startCount: 1 }, ctx(null)),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow('Unauthorized');
    expect(await Bird.countDocuments({})).toBe(0);
  });

  test('an anonymous update cannot silently rewrite another tenant’s row', async () => {
    const egg = await EggProduction.create({ ownerId: ALICE, date: new Date(), eggsCount: 6 });
    await expect(
      Mutation.updateEggProduction(null, { id: String(egg._id), eggsCount: 999 }, ctx(null))
    ).rejects.toThrow('Unauthorized');
    expect((await EggProduction.findById(egg._id)).eggsCount).toBe(6);
  });

  test('deleteFlockEntity will not soft-delete another user’s bird', async () => {
    const bird = await makeBird();
    await expect(
      Mutation.deleteFlockEntity(null, { type: 'bird', id: String(bird._id) }, ctx(BOB))
    ).resolves.toBe(false);
    expect((await Bird.findById(bird._id)).deletedAt).toBeUndefined();

    await expect(
      Mutation.deleteFlockEntity(null, { type: 'bird', id: String(bird._id) }, ctx(ALICE))
    ).resolves.toBe(true);
    expect((await Bird.findById(bird._id)).deletedAt).toBeInstanceOf(Date);
  });

  test('ownerId always comes from the session, never from the payload', async () => {
    const bird = await Mutation.createBird(null, { tagId: 'B-1', name: 'Nugget', ownerId: BOB }, ctx(ALICE));
    expect(bird.ownerId).toBe(ALICE);
  });
});

describe('cross-tenant reference injection', () => {
  test('a health record cannot be attached to somebody else’s bird', async () => {
    const bird = await makeBird();
    await expect(
      Mutation.addHealthRecord(
        null,
        { birdId: String(bird._id), eventDate: new Date(), type: 'checkup' },
        ctx(BOB)
      )
    ).rejects.toThrow('Bird not found');
    expect(await HealthRecord.countDocuments({})).toBe(0);
  });

  test('egg production cannot reference another tenant’s location', async () => {
    const loc = await Location.create({ ownerId: ALICE, name: 'Coop A', type: 'coop' });
    await expect(
      Mutation.recordEggProduction(
        null,
        { date: new Date(), eggsCount: 4, locationId: String(loc._id) },
        ctx(BOB)
      )
    ).rejects.toThrow('Location not found');

    const mine = await Mutation.recordEggProduction(
      null,
      { date: new Date(), eggsCount: 4, locationId: String(loc._id) },
      ctx(ALICE)
    );
    expect(String(mine.locationId)).toBe(String(loc._id));
  });

  test('a pairing cannot be built from another tenant’s birds', async () => {
    const bird = await makeBird();
    await expect(
      Mutation.createPairing(null, { name: 'stolen', roosterIds: [String(bird._id)] }, ctx(BOB))
    ).rejects.toThrow('Bird not found');
    expect(await Pairing.countDocuments({})).toBe(0);
  });

  test('a meat run cannot reference another tenant’s pairing', async () => {
    const pairing = await Pairing.create({ ownerId: ALICE, name: 'Blue pen' });
    await expect(
      Mutation.createMeatRun(
        null,
        { pairingId: String(pairing._id), startDate: new Date(), startCount: 10 },
        ctx(BOB)
      )
    ).rejects.toThrow('Pairing not found');
  });
});

describe('owner happy paths still work', () => {
  test('owner can read, update and delete their own records', async () => {
    const bird = await makeBird();
    const updated = await Mutation.updateBird(null, { id: String(bird._id), name: 'Renamed' }, ctx(ALICE));
    expect(updated.name).toBe('Renamed');

    const loc = await Mutation.createFlockLocation(null, { name: 'Brooder', type: 'brooder' }, ctx(ALICE));
    expect(loc.ownerId).toBe(ALICE);
    expect(await Query.flockLocations(null, { activeOnly: true }, ctx(ALICE))).toHaveLength(1);

    const relocated = await Mutation.updateBird(
      null,
      { id: String(bird._id), locationId: String(loc._id) },
      ctx(ALICE)
    );
    expect(String(relocated.locationId)).toBe(String(loc._id));
  });
});
