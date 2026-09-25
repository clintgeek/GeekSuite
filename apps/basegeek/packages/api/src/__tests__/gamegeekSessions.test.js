/**
 * gamegeekSessions.test.js
 *
 * Logging a play session: minutes accumulate into hoursPlayed, lastPlayedAt
 * moves to now, sessions are capped at MAX_SESSIONS (oldest dropped — their
 * minutes are already counted), and a game sitting on nothing / backlog /
 * on-hold moves to "playing". Deleting a session takes its minutes back out.
 */

import mongoose from 'mongoose';

const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { resolvers } = await import('../graphql/gamegeek/resolvers.js');
const { MAX_SESSIONS } = (await import('@geeksuite/schemas/gamegeek/constants')).default;

const { Mutation } = resolvers;
const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (id = ALICE) => ({ user: { id } });

const newGame = async (shelf) => {
  const g = await Mutation.createGame(null, { input: { title: `G ${Math.random()}` }, shelf }, ctx());
  return String(g._id);
};
const log = (gameId, playedOn, minutes, who = ALICE) =>
  Mutation.logGameSession(null, { gameId, input: { playedOn, minutes } }, ctx(who));
const row = (gameId, userId = ALICE) => GamePlayer.findOne({ userId, gameId }).lean();

beforeAll(async () => {
  await Game.db.asPromise();
  await Promise.all([Game.init(), GamePlayer.init()]);
}, 60000);

afterEach(async () => {
  await Promise.all([Game.deleteMany({}), GamePlayer.deleteMany({})]);
});

afterAll(async () => {
  await Game.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

test('minutes accumulate into hoursPlayed and lastPlayedAt moves to now', async () => {
  const gameId = await newGame('playing');
  const before = Date.now();
  await log(gameId, '2026-09-01', 30);
  const g = await log(gameId, '2026-09-02', 90);
  const r = await row(gameId);
  expect(r.hoursPlayed).toBeCloseTo(2, 6);
  expect(r.sessions).toHaveLength(2);
  expect(r.lastPlayedAt.getTime()).toBeGreaterThanOrEqual(before);
  expect(resolvers.GameMyState.hoursPlayed(g.__me)).toBe(2);
});

test('sessions(limit) is newest first by playedOn, then createdAt', async () => {
  const gameId = await newGame('playing');
  await log(gameId, '2026-09-03', 10);
  await log(gameId, '2026-09-01', 20);
  await log(gameId, '2026-09-03', 30); // same day, logged later → first
  const g = await log(gameId, '2026-09-02', 40);
  const minutes = (limit) => resolvers.GameMyState.sessions(g.__me, { limit }).map((s) => s.minutes);
  expect(minutes(20)).toEqual([30, 10, 40, 20]);
  expect(minutes(2)).toEqual([30, 10]);
  expect(minutes(0)).toEqual([30]); // clamped to at least one
});

test('a session on a game I have no row for creates my row, on "playing"', async () => {
  const g = await Mutation.createGame(null, { input: { title: 'Alice adds it' } }, ctx(ALICE));
  const gameId = String(g._id);
  await log(gameId, '2026-09-01', 60, BOB);
  const bob = await row(gameId, BOB);
  expect(bob).toMatchObject({ shelf: 'playing', hoursPlayed: 1, householdId: 'default' });
  expect((await row(gameId, ALICE)).hoursPlayed).toBe(0); // Alice's hours untouched
});

describe('shelf auto-move', () => {
  test.each([['backlog'], ['on-hold']])('%s → playing', async (shelf) => {
    const gameId = await newGame(shelf);
    await log(gameId, '2026-09-01', 15);
    expect((await row(gameId)).shelf).toBe('playing');
  });

  test('no shelf (null) → playing', async () => {
    const gameId = await newGame();
    await Mutation.setGameState(null, { gameId, input: { shelf: null } }, ctx());
    await log(gameId, '2026-09-01', 15);
    expect((await row(gameId)).shelf).toBe('playing');
  });

  test.each([['finished'], ['abandoned'], ['wishlist'], ['playing']])('%s stays put', async (shelf) => {
    const gameId = await newGame(shelf);
    await log(gameId, '2026-09-01', 15);
    expect((await row(gameId)).shelf).toBe(shelf);
  });

  test('a custom shelf stays put', async () => {
    await Mutation.addGameShelf(null, { label: 'Couch' }, ctx());
    const gameId = await newGame('custom-couch');
    await log(gameId, '2026-09-01', 15);
    expect((await row(gameId)).shelf).toBe('custom-couch');
  });
});

test(`sessions cap at MAX_SESSIONS (${MAX_SESSIONS}); the oldest drops, its hours stay counted`, async () => {
  const gameId = await newGame('playing');
  const start = Date.UTC(2020, 0, 1);
  const sessions = Array.from({ length: MAX_SESSIONS }, (_, i) => ({
    _id: new mongoose.Types.ObjectId(),
    playedOn: new Date(start + i * 86400000),
    minutes: 60,
    note: '',
    createdAt: new Date(start + i * 86400000),
  }));
  await GamePlayer.collection.updateOne(
    { userId: ALICE, gameId: new mongoose.Types.ObjectId(gameId) },
    { $set: { sessions, hoursPlayed: MAX_SESSIONS } }
  );

  await log(gameId, '2026-09-01', 30);
  const r = await row(gameId);
  expect(r.sessions).toHaveLength(MAX_SESSIONS);
  expect(r.hoursPlayed).toBeCloseTo(MAX_SESSIONS + 0.5, 6);
  const days = r.sessions.map((s) => s.playedOn.getTime());
  expect(days).not.toContain(start); // the very oldest is gone
  expect(days).toContain(start + 86400000); // the second-oldest survives
  expect(days).toContain(Date.UTC(2026, 8, 1)); // the new one is in
});

test('deleting a session takes its minutes back out (never below zero)', async () => {
  const gameId = await newGame('playing');
  await log(gameId, '2026-09-01', 30);
  const g = await log(gameId, '2026-09-02', 90);
  const target = g.__me.sessions.find((s) => s.minutes === 90);
  const after = await Mutation.deleteGameSession(null, { gameId, sessionId: String(target._id) }, ctx());
  expect(after.__me.sessions.map((s) => s.minutes)).toEqual([30]);
  expect((await row(gameId)).hoursPlayed).toBeCloseTo(0.5, 6);

  await Mutation.setGameState(null, { gameId, input: { hoursPlayed: 0 } }, ctx());
  const only = (await row(gameId)).sessions[0];
  await Mutation.deleteGameSession(null, { gameId, sessionId: String(only._id) }, ctx());
  expect((await row(gameId)).hoursPlayed).toBe(0);

  await expect(
    Mutation.deleteGameSession(null, { gameId, sessionId: String(only._id) }, ctx())
  ).rejects.toMatchObject({ extensions: expect.objectContaining({ code: 'NOT_FOUND' }) });
});

test('setting hoursPlayed by hand marks hoursSource manual', async () => {
  const gameId = await newGame('playing');
  await GamePlayer.updateOne({ userId: ALICE, gameId }, { $set: { hoursSource: 'steam', hoursPlayed: 99 } });
  await Mutation.setGameState(null, { gameId, input: { rating: 3 } }, ctx());
  expect((await row(gameId)).hoursSource).toBe('steam'); // untouched when hours aren't sent
  await Mutation.setGameState(null, { gameId, input: { hoursPlayed: 12 } }, ctx());
  expect(await row(gameId)).toMatchObject({ hoursPlayed: 12, hoursSource: 'manual', rating: 3 });
});

test('playthroughs: add, edit by id, unknown id is not found, delete', async () => {
  const gameId = await newGame('playing');
  const a = await Mutation.saveGamePlaythrough(null, { gameId, input: { completion: 'story', hours: 20 } }, ctx());
  const id = String(a.__me.playthroughs[0]._id);
  const b = await Mutation.saveGamePlaythrough(null, { gameId, input: { id, completion: 'complete' } }, ctx());
  expect(b.__me.playthroughs).toHaveLength(1);
  expect(b.__me.playthroughs[0]).toMatchObject({ completion: 'complete', hours: 20 });
  expect(b.__me.shelf).toBe('playing'); // no auto-move on playthrough save
  await expect(
    Mutation.saveGamePlaythrough(null, { gameId, input: { id: String(new mongoose.Types.ObjectId()) } }, ctx())
  ).rejects.toMatchObject({ extensions: expect.objectContaining({ code: 'NOT_FOUND' }) });
  const c = await Mutation.deleteGamePlaythrough(null, { gameId, playthroughId: id }, ctx());
  expect(c.__me.playthroughs).toEqual([]);
});
