/**
 * gamegeekEnrichment.test.js
 *
 * The gateway's side of metadata enrichment (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md):
 *   1. Game.enrichment resolves over the real schema — null when the game was
 *      never tried, the record's fields when it was.
 *   2. updateGame never wipes or rewrites `enrichment` (GameInput has no such
 *      field, and the save writes only the paths the input touched), so the
 *      record the gamegeek backend wrote survives every edit.
 */

import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { GameProfile } = await import('../graphql/gamegeek/models/profile.js');
const { resolvers: gamegeekResolvers } = await import('../graphql/gamegeek/resolvers.js');
const { typeDefs, resolvers } = await import('../graphql/index.js');

const { Mutation } = gamegeekResolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const ctx = () => ({ user: { id: ALICE } });

const RECORD = {
  status: 'matched',
  provider: 'steam',
  providerId: '620',
  matchedTitle: 'Portal 2',
  filled: ['description', 'developers'],
  filledHashes: { description: 'abc', developers: 'def' },
  addedPlatforms: ['linux'],
  coverFromEnrichment: true,
  manual: false,
  attempts: 1,
  lastTriedAt: new Date('2026-09-25T12:00:00Z'),
  matchedAt: new Date('2026-09-25T12:00:00Z'),
  error: null,
  providersTried: ['steam'],
};

let server;

beforeAll(async () => {
  await Game.db.asPromise();
  await Promise.all([Game.init(), GamePlayer.init(), GameProfile.init()]);
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);

afterEach(async () => {
  await Promise.all([Game.deleteMany({}), GamePlayer.deleteMany({}), GameProfile.deleteMany({})]);
});

afterAll(async () => {
  await server?.stop();
  await Game.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const QUERY = `query ($id: ID!) {
  game(id: $id) {
    id
    enrichment { status provider providerId matchedTitle matchedAt attempts error manual }
  }
}`;

async function queryGame(id) {
  const res = await server.executeOperation({ query: QUERY, variables: { id } }, { contextValue: ctx() });
  expect(res.body.kind).toBe('single');
  expect(res.body.singleResult.errors).toBeUndefined();
  return res.body.singleResult.data.game;
}

describe('Game.enrichment', () => {
  test('null for a game enrichment has never touched', async () => {
    const game = await Game.create({ householdId: 'default', title: 'Untouched' });
    expect((await queryGame(String(game._id))).enrichment).toBeNull();
  });

  test('null when the key is missing entirely (a Playnite-imported document)', async () => {
    const game = await Game.create({ householdId: 'default', title: 'Imported' });
    await Game.collection.updateOne({ _id: game._id }, { $unset: { enrichment: '' } });
    expect((await queryGame(String(game._id))).enrichment).toBeNull();
  });

  test('resolves the record; unlink fingerprints are not exposed', async () => {
    const game = await Game.create({ householdId: 'default', title: 'Portal 2', enrichment: RECORD });
    const { enrichment } = await queryGame(String(game._id));
    expect(enrichment).toEqual({
      status: 'matched',
      provider: 'steam',
      providerId: '620',
      matchedTitle: 'Portal 2',
      matchedAt: expect.anything(),
      attempts: 1,
      error: null,
      manual: false,
    });
    expect(new Date(enrichment.matchedAt).toISOString()).toBe('2026-09-25T12:00:00.000Z');
  });

  test('a record without a status reads as pending, attempts 0', async () => {
    const game = await Game.create({ householdId: 'default', title: 'X' });
    await Game.collection.updateOne({ _id: game._id }, { $set: { enrichment: { provider: null } } });
    const { enrichment } = await queryGame(String(game._id));
    expect(enrichment.status).toBe('pending');
    expect(enrichment.attempts).toBe(0);
    expect(enrichment.manual).toBe(false);
  });

  test('the SDL refuses a field it does not declare (filledHashes stays server-side)', async () => {
    const game = await Game.create({ householdId: 'default', title: 'Portal 2', enrichment: RECORD });
    const res = await server.executeOperation(
      { query: 'query ($id: ID!) { game(id: $id) { enrichment { filledHashes } } }', variables: { id: String(game._id) } },
      { contextValue: ctx() }
    );
    expect(res.body.singleResult.errors?.[0]?.message).toMatch(/filledHashes/);
  });
});

describe('updateGame never wipes enrichment', () => {
  test('editing title, description, developers, externalIds and copies leaves the record byte-for-byte', async () => {
    const game = await Game.create({
      householdId: 'default',
      title: 'Portal 2',
      description: 'From Steam.',
      developers: ['Valve'],
      enrichment: RECORD,
    });
    const before = (await Game.findById(game._id).lean()).enrichment;

    await Mutation.updateGame(
      null,
      {
        id: String(game._id),
        input: {
          title: 'Portal 2 (mine)',
          description: 'My words.',
          developers: ['Valve', 'Someone'],
          externalIds: { igdb: '1020' },
          copies: [{ platform: 'pc', format: 'digital', storefront: 'steam' }],
        },
      },
      ctx()
    );

    const after = await Game.findById(game._id).lean();
    expect(after.title).toBe('Portal 2 (mine)');
    expect(after.description).toBe('My words.');
    expect(after.enrichment).toEqual(before);
  });

  test('an update on a game with no enrichment does not invent one', async () => {
    const game = await Game.create({ householdId: 'default', title: 'Plain' });
    await Mutation.updateGame(null, { id: String(game._id), input: { title: 'Plain 2' } }, ctx());
    expect((await Game.findById(game._id).lean()).enrichment ?? null).toBeNull();
  });
});
