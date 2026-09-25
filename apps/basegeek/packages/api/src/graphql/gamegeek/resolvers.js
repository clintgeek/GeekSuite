import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import { Game } from './models/game.js';
import { GamePlayer } from './models/gamePlayer.js';
import { GameProfile } from './models/profile.js';
import householdModule from '@geeksuite/schemas/gamegeek/household';
import constantsModule from '@geeksuite/schemas/gamegeek/constants';
import gameSchemaModule from '@geeksuite/schemas/gamegeek/game';
import {
  validateInput,
  GAME_SORTS,
  CREATE_GAMES_MAX,
  MAX_CUSTOM_SHELF_LABEL,
  gamesArgsSchema,
  gameIdArgsSchema,
  createGameArgsSchema,
  createGamesArgsSchema,
  updateGameArgsSchema,
  setGameStateArgsSchema,
  logGameSessionArgsSchema,
  deleteGameSessionArgsSchema,
  saveGamePlaythroughArgsSchema,
  deleteGamePlaythroughArgsSchema,
  saveGameProfileArgsSchema,
  addGameShelfArgsSchema,
  removeGameShelfArgsSchema,
  saveGameFilterArgsSchema,
  deleteGameFilterArgsSchema,
} from './validation.js';

/**
 * GameGeek gateway — DOCS/GameGeekPlan.md §2.1, §2.1a, §3, §4.1.
 *
 * ## Tenancy (the rule this module is built around)
 *
 * Every resolver opens with
 *     const userId = requireUser(user);
 *     const householdId = resolveHouseholdId(user);
 * and every `Game` filter below carries `householdId`. `GamePlayer` reads are
 * scoped by `userId` (my state) or `householdId` (the household view), and the
 * profile by `userId`. No input schema accepts a `householdId` — it only ever
 * comes from the session. Follow flockgeek's rule: never build an unscoped
 * filter; if you add a query, the tenant goes in the literal, not in a
 * conditional.
 *
 * ## Split of state
 *
 * `Game` is the household's catalog entry; `GamePlayer` is one user's shelf,
 * rating, hours, sessions and playthroughs for it. The `Game.me` field is the
 * caller's row (null until they touch the game) and `Game.household` is every
 * OTHER member's row in the same household.
 *
 * Input validation runs AFTER auth everywhere: an anonymous caller sees
 * `Unauthorized`, never a field-level complaint.
 */

const { resolveHouseholdId } = householdModule;
const { BUILT_IN_SHELVES, PLATFORMS, STOREFRONTS, COPY_FORMATS, GAME_MODES, COMPLETION_LEVELS, MAX_SESSIONS, bounds } =
  constantsModule;
const { computeSortTitle } = gameSchemaModule;

const CUSTOM_SHELF_PREFIX = 'custom-';
const MAX_CUSTOM_SHELVES = 20;
const MAX_SAVED_FILTERS = 30;
const SEARCH_TERM_MAX = 200;
/** Shelves a logged session promotes to "playing". */
const AUTO_PLAYING_FROM = [null, 'backlog', 'on-hold'];

const validateGames = validateInput(gamesArgsSchema);
const validateGameId = validateInput(gameIdArgsSchema);
const validateCreateGame = validateInput(createGameArgsSchema);
const validateCreateGames = validateInput(createGamesArgsSchema);
const validateUpdateGame = validateInput(updateGameArgsSchema);
const validateSetGameState = validateInput(setGameStateArgsSchema);
const validateLogGameSession = validateInput(logGameSessionArgsSchema);
const validateDeleteGameSession = validateInput(deleteGameSessionArgsSchema);
const validateSaveGamePlaythrough = validateInput(saveGamePlaythroughArgsSchema);
const validateDeleteGamePlaythrough = validateInput(deleteGamePlaythroughArgsSchema);
const validateSaveGameProfile = validateInput(saveGameProfileArgsSchema);
const validateAddGameShelf = validateInput(addGameShelfArgsSchema);
const validateRemoveGameShelf = validateInput(removeGameShelfArgsSchema);
const validateSaveGameFilter = validateInput(saveGameFilterArgsSchema);
const validateDeleteGameFilter = validateInput(deleteGameFilterArgsSchema);

// ── Errors ───────────────────────────────────────────────────────────────────

/** Same message and `code` as bookgeek's requireUser; also on extensions. */
function requireUser(user) {
  if (!user?.id) {
    const err = new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHORIZED' } });
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  return String(user.id);
}

function userError(message, code = 'BAD_USER_INPUT') {
  const err = new GraphQLError(message, { extensions: { code } });
  err.code = code;
  return err;
}

const notFound = (what = 'Game') => userError(`${what} not found`, 'NOT_FOUND');

/** A malformed id is "not found", never a CastError. */
function validObjectId(id) {
  return (typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)) || id instanceof mongoose.Types.ObjectId;
}

/** Escaped + bounded, so a user search term is a literal, not a ReDoS. */
function searchRegex(value) {
  return String(value)
    .slice(0, SEARCH_TERM_MAX)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeExact(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function customShelfIdFromLabel(label) {
  const slug = String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `${CUSTOM_SHELF_PREFIX}${slug}` : null;
}

const toObj = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

// ── Scoped lookups ───────────────────────────────────────────────────────────

/** The household's game, or NOT_FOUND. Never looks outside `householdId`. */
async function requireGame(householdId, id) {
  if (!validObjectId(id)) throw notFound();
  const game = await Game.findOne({ _id: id, householdId }).lean();
  if (!game) throw notFound();
  return game;
}

async function getOrCreateProfile(userId, householdId) {
  return GameProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, householdId } },
    { upsert: true, new: true, lean: true }
  );
}

/**
 * A shelf as a write target. `undefined` = leave alone, `null` = clear. Shape
 * was checked by zod; a custom shelf must also exist on the caller's profile.
 */
async function resolveShelf(userId, shelf) {
  if (shelf === undefined || shelf === null) return shelf;
  if (BUILT_IN_SHELVES.includes(shelf)) return shelf;
  const profile = await GameProfile.findOne({ userId, 'customShelves.id': shelf }, { _id: 1 }).lean();
  if (!profile) throw userError(`Unknown shelf "${shelf}"`, 'BAD_USER_INPUT');
  return shelf;
}

/** A parent (DLC → base game) must be a game in the SAME household. */
async function checkParent(householdId, parentId, selfId) {
  if (parentId === undefined || parentId === null) return parentId;
  if (selfId && String(parentId) === String(selfId)) throw userError('A game cannot be its own parent');
  const parent = await Game.findOne({ _id: parentId, householdId }, { _id: 1 }).lean();
  if (!parent) throw userError('Parent game not found');
  return parentId;
}

// ── Game field mapping ───────────────────────────────────────────────────────

const LIST_FIELDS = ['developers', 'publishers', 'genres', 'tags', 'modes', 'platformsAvailable'];
const SCALAR_FIELDS = ['description', 'maxLocalPlayers', 'releaseDate', 'source'];
const NESTED_FIELDS = ['series', 'timeToBeat', 'externalIds'];

function dedupeList(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const key = String(item).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function copyFromInput(input, existingIds) {
  const copy = {
    platform: input.platform,
    format: input.format ?? 'digital',
    storefront: input.storefront ?? null,
    acquiredAt: input.acquiredAt ?? null,
    notes: input.notes ?? '',
  };
  // Keep an existing copy's id; an unknown id is simply a new copy.
  if (input.id && existingIds.has(String(input.id))) copy._id = input.id;
  return copy;
}

/** Validated create input → a Game document body (no tenant keys). */
function gameDocFromInput(input) {
  const doc = { title: input.title, sortTitle: computeSortTitle(input.title) };
  for (const f of LIST_FIELDS) if (input[f] != null) doc[f] = dedupeList(input[f]);
  for (const f of SCALAR_FIELDS) if (input[f] !== undefined) doc[f] = input[f];
  if (doc.description === null) doc.description = '';
  for (const f of NESTED_FIELDS) if (input[f]) doc[f] = { ...input[f] };
  if (input.parentId) doc.parentId = input.parentId;
  doc.copies = (input.copies || []).map((c) => copyFromInput(c, new Set()));
  doc.owned = doc.copies.length > 0;
  if (!doc.source) doc.source = 'manual';
  return doc;
}

// ── Per-request batching for Game.me / Game.household ───────────────────────
//
// A library page resolves `me` and `household` on up to 100 games. Rather
// than one query per game (N+1), the first call in a tick queues its gameId,
// and one `$in` query per request-scoped loader answers the whole batch. The
// loaders hang off the GraphQL context object (a WeakMap, so nothing leaks
// past the request).

const requestLoaders = new WeakMap();

function makeBatchLoader(fetchMany) {
  const cache = new Map();
  let queue = null;
  return {
    load(id) {
      const key = String(id);
      if (cache.has(key)) return cache.get(key);
      if (!queue) {
        queue = new Map();
        const batch = queue;
        setImmediate(async () => {
          queue = null;
          try {
            const results = await fetchMany([...batch.keys()]);
            for (const [k, deferred] of batch) deferred.resolve(results.get(k) ?? null);
          } catch (err) {
            for (const deferred of batch.values()) deferred.reject(err);
          }
        });
      }
      let deferred;
      const promise = new Promise((resolve, reject) => {
        deferred = { resolve, reject };
      });
      queue.set(key, deferred);
      cache.set(key, promise);
      return promise;
    },
  };
}

function loaderFor(context, name, fetchMany) {
  // Resolvers called without a context object (unit tests) still work, just unbatched-cache.
  const holder = context && typeof context === 'object' ? context : {};
  let store = requestLoaders.get(holder);
  if (!store) {
    store = new Map();
    requestLoaders.set(holder, store);
  }
  if (!store.has(name)) store.set(name, makeBatchLoader(fetchMany));
  return store.get(name);
}

function myStateLoader(context, userId, householdId) {
  return loaderFor(context, `me:${userId}:${householdId}`, async (gameIds) => {
    const rows = await GamePlayer.find({ userId, householdId, gameId: { $in: gameIds } }).lean();
    return new Map(rows.map((r) => [String(r.gameId), r]));
  });
}

async function displayNamesFor(userIds) {
  const names = new Map();
  const ids = userIds.filter((id) => validObjectId(id));
  if (ids.length === 0) return names;
  try {
    const { User } = await import('../../models/user.js');
    const users = await User.find({ _id: { $in: ids } }, { 'profile.displayName': 1, username: 1 }).lean();
    for (const u of users) {
      names.set(String(u._id), u.profile?.displayName || u.username || null);
    }
  } catch {
    // Display names are decoration; a userGeek hiccup must not break the library.
  }
  return names;
}

function householdLoader(context, userId, householdId) {
  return loaderFor(context, `household:${userId}:${householdId}`, async (gameIds) => {
    const rows = await GamePlayer.find(
      { householdId, gameId: { $in: gameIds }, userId: { $ne: userId } },
      { userId: 1, gameId: 1, shelf: 1, rating: 1, hoursPlayed: 1 }
    )
      .sort({ userId: 1 })
      .lean();
    const names = await displayNamesFor([...new Set(rows.map((r) => r.userId))]);
    const byGame = new Map();
    for (const r of rows) {
      const key = String(r.gameId);
      if (!byGame.has(key)) byGame.set(key, []);
      byGame.get(key).push({ ...r, displayName: names.get(String(r.userId)) ?? null });
    }
    return byGame;
  });
}

/** Attach the caller's row so `Game.me` needs no second lookup. */
const withMe = (game, player) => ({ ...toObj(game), __me: player ? toObj(player) : null });

// ── The games query ──────────────────────────────────────────────────────────

/** Sort key per advertised sort. The last three read the CALLER's GamePlayer row. */
const SORT_FIELDS = {
  title: '$sortTitle',
  dateAdded: '$createdAt',
  releaseDate: '$releaseDate',
  rating: '$__me.rating',
  lastPlayed: '$__me.lastPlayedAt',
  hoursPlayed: '$__me.hoursPlayed',
};
// Tripwire: an advertised sort without an arm here is exactly BookGeek's
// silent-no-op bug. Fail at import, not in production.
for (const s of GAME_SORTS) {
  if (!SORT_FIELDS[s]) throw new Error(`gamegeek: sort "${s}" is advertised but has no resolver arm`);
}

async function queryGames({ userId, householdId, args }) {
  const { page, limit, q, shelf, platform, owned, sort, sortDir } = args;
  const pageNum = Math.max(1, page ?? 1);
  const limitNum = Math.max(1, Math.min(100, limit ?? 48));
  const dir = (sortDir ?? 'asc') === 'desc' ? -1 : 1;
  const sortKey = sort ?? 'title';

  // The tenant is a literal in the first stage — never conditional.
  const gameMatch = { householdId };
  const and = [];
  if (platform) and.push({ 'copies.platform': platform });
  if (owned === 'true') and.push({ owned: true });
  else if (owned === 'false') and.push({ owned: false });
  if (q && q.trim()) {
    const needle = searchRegex(q.trim());
    and.push({
      $or: ['title', 'developers', 'publishers', 'tags', 'genres'].map((f) => ({
        [f]: { $regex: needle, $options: 'i' },
      })),
    });
  }
  if (and.length) gameMatch.$and = and;

  const pipeline = [
    { $match: gameMatch },
    {
      $lookup: {
        from: GamePlayer.collection.name,
        let: { gid: '$_id' },
        pipeline: [
          { $match: { userId, householdId, $expr: { $eq: ['$gameId', '$$gid'] } } },
          { $limit: 1 },
        ],
        as: '__meArr',
      },
    },
    { $addFields: { __me: { $ifNull: [{ $arrayElemAt: ['$__meArr', 0] }, null] } } },
    { $project: { __meArr: 0 } },
  ];

  if (shelf === 'unshelved') {
    // No row for me, or a row with no shelf — both are `__me.shelf: null`.
    pipeline.push({ $match: { '__me.shelf': null } });
  } else if (shelf) {
    pipeline.push({ $match: { '__me.shelf': shelf } });
  }

  // Nulls last in BOTH directions, then a stable tiebreak: sortTitle, _id.
  pipeline.push({
    $addFields: {
      __sortKey: { $ifNull: [SORT_FIELDS[sortKey], null] },
    },
  });
  pipeline.push({
    $addFields: { __sortNull: { $cond: [{ $eq: ['$__sortKey', null] }, 1, 0] } },
  });
  const sortStage = { __sortNull: 1, __sortKey: dir };
  if (sortKey !== 'title') sortStage.sortTitle = 1;
  sortStage._id = 1;

  pipeline.push({
    $facet: {
      items: [
        { $sort: sortStage },
        { $skip: (pageNum - 1) * limitNum },
        { $limit: limitNum },
        { $project: { __sortKey: 0, __sortNull: 0 } },
      ],
      total: [{ $count: 'n' }],
    },
  });

  const [result] = await Game.aggregate(pipeline);
  const total = result?.total?.[0]?.n ?? 0;
  return {
    games: result?.items ?? [],
    total,
    page: pageNum,
    pages: Math.max(1, Math.ceil(total / limitNum)),
  };
}

// ── Player-row helpers ───────────────────────────────────────────────────────

async function loadPlayerDoc(userId, householdId, gameId) {
  let doc = await GamePlayer.findOne({ userId, householdId, gameId });
  if (!doc) doc = new GamePlayer({ userId, householdId, gameId });
  return doc;
}

const roundHours = (h) => Math.max(0, Math.round(h * 1000) / 1000);

function sortSessions(sessions) {
  return [...sessions].sort((a, b) => {
    const d = new Date(b.playedOn) - new Date(a.playedOn);
    if (d !== 0) return d;
    const c = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (c !== 0) return c;
    // Same millisecond: ObjectIds from one process increase, so newer wins.
    return String(b._id ?? '').localeCompare(String(a._id ?? ''));
  });
}

// ── Resolvers ────────────────────────────────────────────────────────────────

export const resolvers = {
  Game: {
    id: (g) => String(g._id),
    parentId: (g) => (g.parentId ? String(g.parentId) : null),
    developers: (g) => g.developers ?? [],
    publishers: (g) => g.publishers ?? [],
    genres: (g) => g.genres ?? [],
    tags: (g) => g.tags ?? [],
    modes: (g) => g.modes ?? [],
    platformsAvailable: (g) => g.platformsAvailable ?? [],
    copies: (g) => g.copies ?? [],
    owned: (g) => Boolean(g.owned ?? (Array.isArray(g.copies) && g.copies.length > 0)),
    releaseYear: (g) => {
      if (!g.releaseDate) return null;
      const d = new Date(g.releaseDate);
      return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear();
    },
    coverUrl: (g) => {
      if (!g.coverPath) return null;
      const v = g.updatedAt ? new Date(g.updatedAt).getTime() : 0;
      return `/api/games/${g._id}/cover?v=${v}`;
    },
    me: async (g, _args, context) => {
      if (Object.prototype.hasOwnProperty.call(g, '__me')) return g.__me;
      const userId = requireUser(context?.user);
      const householdId = resolveHouseholdId(context.user);
      return myStateLoader(context, userId, householdId).load(g._id);
    },
    household: async (g, _args, context) => {
      const userId = requireUser(context?.user);
      const householdId = resolveHouseholdId(context.user);
      return (await householdLoader(context, userId, householdId).load(g._id)) ?? [];
    },
  },
  GameCopy: {
    id: (c) => String(c._id ?? c.id),
  },
  GamePlaythrough: {
    id: (p) => String(p._id ?? p.id),
  },
  GameSession: {
    id: (s) => String(s._id ?? s.id),
  },
  GameMyState: {
    playthroughs: (p) => p.playthroughs ?? [],
    sessions: (p, { limit } = {}) => {
      const n = Math.max(1, Math.min(MAX_SESSIONS, Number.isInteger(limit) ? limit : 20));
      return sortSessions(p.sessions ?? []).slice(0, n);
    },
    hoursPlayed: (p) => (p.hoursPlayed == null ? null : roundHours(p.hoursPlayed)),
  },
  GameHouseholdEntry: {
    userId: (e) => String(e.userId),
  },
  GameProfile: {
    customShelves: (p) => p?.customShelves ?? [],
    savedFilters: (p) => p?.savedFilters ?? [],
    platformsOwned: (p) => p?.platformsOwned ?? [],
  },

  Query: {
    games: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const args = validateGames(rawArgs ?? {});
      return queryGames({ userId, householdId, args });
    },

    game: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { id } = validateGameId(rawArgs);
      if (!validObjectId(id)) return null;
      const game = await Game.findOne({ _id: id, householdId }).lean();
      if (!game) return null;
      const me = await GamePlayer.findOne({ userId, householdId, gameId: game._id }).lean();
      return withMe(game, me);
    },

    gameShelves: async (_, __, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);

      const [total, owned, shelfRows, platformRows, profile] = await Promise.all([
        Game.countDocuments({ householdId }),
        Game.countDocuments({ householdId, owned: true }),
        GamePlayer.aggregate([
          { $match: { userId, householdId, shelf: { $type: 'string', $ne: '' } } },
          // Only rows whose game is still in this household.
          {
            $lookup: {
              from: Game.collection.name,
              let: { gid: '$gameId' },
              pipeline: [{ $match: { householdId, $expr: { $eq: ['$_id', '$$gid'] } } }, { $project: { _id: 1 } }],
              as: 'g',
            },
          },
          { $match: { 'g.0': { $exists: true } } },
          { $group: { _id: '$shelf', count: { $sum: 1 } } },
        ]),
        Game.aggregate([
          { $match: { householdId } },
          { $unwind: '$copies' },
          { $group: { _id: '$copies.platform', games: { $addToSet: '$_id' } } },
          { $project: { count: { $size: '$games' } } },
          { $sort: { count: -1, _id: 1 } },
        ]),
        GameProfile.findOne({ userId }, { customShelves: 1 }).lean(),
      ]);

      const counts = new Map(shelfRows.map((r) => [r._id, r.count]));
      const shelved = shelfRows.reduce((n, r) => n + r.count, 0);
      const order = [...BUILT_IN_SHELVES, ...(profile?.customShelves ?? []).map((s) => s.id)];
      for (const r of shelfRows) if (!order.includes(r._id)) order.push(r._id);

      return {
        total,
        owned,
        unshelved: Math.max(0, total - shelved),
        shelves: order.map((shelf) => ({ shelf, count: counts.get(shelf) ?? 0 })),
        platforms: platformRows.map((r) => ({ shelf: r._id, count: r.count })),
      };
    },

    gameProfile: async (_, __, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      return getOrCreateProfile(userId, householdId);
    },

    gameVocabulary: async (_, __, { user } = {}) => {
      requireUser(user);
      resolveHouseholdId(user);
      return {
        shelves: [...BUILT_IN_SHELVES],
        platforms: [...PLATFORMS],
        storefronts: [...STOREFRONTS],
        copyFormats: [...COPY_FORMATS],
        modes: [...GAME_MODES],
        completionLevels: [...COMPLETION_LEVELS],
      };
    },
  },

  Mutation: {
    createGame: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { input, shelf } = validateCreateGame(rawArgs);
      const targetShelf = (await resolveShelf(userId, shelf)) ?? 'backlog';
      await checkParent(householdId, input.parentId);

      const game = await Game.create({ ...gameDocFromInput(input), householdId, createdBy: userId });
      const player = await GamePlayer.create({ householdId, userId, gameId: game._id, shelf: targetShelf });
      return withMe(game, player);
    },

    createGames: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { inputs, shelf } = validateCreateGames(rawArgs);
      const targetShelf = (await resolveShelf(userId, shelf)) ?? 'backlog';

      // Case-insensitive exact title match against this household only.
      const titles = inputs.map((i) => i.title);
      const existing = await Game.find(
        { householdId, title: { $in: titles.map((t) => new RegExp(`^${escapeExact(t)}$`, 'i')) } },
        { title: 1 }
      ).lean();
      const taken = new Set(existing.map((g) => g.title.toLowerCase()));

      const fresh = [];
      for (const input of inputs) {
        const key = input.title.toLowerCase();
        if (taken.has(key)) continue;
        taken.add(key); // also dedupes within the batch
        if (input.parentId) await checkParent(householdId, input.parentId);
        fresh.push({ ...gameDocFromInput(input), householdId, createdBy: userId });
      }
      if (fresh.length === 0) return [];
      if (fresh.length > CREATE_GAMES_MAX) throw userError(`at most ${CREATE_GAMES_MAX} games per call`);

      const games = await Game.insertMany(fresh);
      const players = await GamePlayer.insertMany(
        games.map((g) => ({ householdId, userId, gameId: g._id, shelf: targetShelf }))
      );
      const byGame = new Map(players.map((p) => [String(p.gameId), p]));
      return games.map((g) => withMe(g, byGame.get(String(g._id))));
    },

    updateGame: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { id, input } = validateUpdateGame(rawArgs);
      if (!validObjectId(id)) throw notFound();
      const game = await Game.findOne({ _id: id, householdId });
      if (!game) throw notFound();

      if (input.parentId !== undefined) {
        await checkParent(householdId, input.parentId, game._id);
        game.parentId = input.parentId;
      }
      if (input.title !== undefined) game.title = input.title;
      for (const f of LIST_FIELDS) if (input[f] !== undefined) game[f] = dedupeList(input[f] ?? []);
      for (const f of SCALAR_FIELDS) if (input[f] !== undefined) game[f] = input[f];
      if (input.description === null) game.description = '';
      if (input.source === null) game.source = 'manual';
      // Nested objects merge: keys present in the input are set, omitted keys stay.
      for (const f of NESTED_FIELDS) {
        if (input[f] === undefined) continue;
        if (input[f] === null) {
          for (const path of Object.keys(Game.schema.paths)) {
            if (path.startsWith(`${f}.`)) game.set(path, null);
          }
          continue;
        }
        for (const [k, v] of Object.entries(input[f])) if (v !== undefined) game.set(`${f}.${k}`, v);
      }
      if (input.copies !== undefined) {
        const existingIds = new Set((game.copies ?? []).map((c) => String(c._id)));
        game.copies = (input.copies ?? []).map((c) => copyFromInput(c, existingIds));
      }
      await game.save();

      const me = await GamePlayer.findOne({ userId, householdId, gameId: game._id }).lean();
      return withMe(game, me);
    },

    deleteGame: async (_, rawArgs, { user } = {}) => {
      requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { id } = validateGameId(rawArgs);
      if (!validObjectId(id)) return { success: false, message: 'Game not found' };
      const res = await Game.deleteOne({ _id: id, householdId });
      if (res.deletedCount === 0) return { success: false, message: 'Game not found' };
      // Every member's state for it — within this household only.
      await GamePlayer.deleteMany({ householdId, gameId: id });
      return { success: true, message: 'Game deleted' };
    },

    setGameState: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { gameId, input } = validateSetGameState(rawArgs);
      const game = await requireGame(householdId, gameId);

      const set = {};
      if (input.shelf !== undefined) set.shelf = await resolveShelf(userId, input.shelf);
      if (input.rating !== undefined) set.rating = input.rating;
      if (input.review !== undefined) set.review = input.review ?? '';
      if (input.notes !== undefined) set.notes = input.notes ?? '';
      if (input.progress !== undefined) set.progress = input.progress;
      if (input.favorite !== undefined) set.favorite = Boolean(input.favorite);
      if (input.hoursPlayed !== undefined) {
        set.hoursPlayed = input.hoursPlayed ?? 0;
        set.hoursSource = 'manual';
      }

      const update = Object.keys(set).length ? { $set: set } : { $setOnInsert: { shelf: null } };
      const player = await GamePlayer.findOneAndUpdate({ userId, householdId, gameId: game._id }, update, {
        upsert: true,
        new: true,
        lean: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      });
      return withMe(game, player);
    },

    logGameSession: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { gameId, input } = validateLogGameSession(rawArgs);
      const game = await requireGame(householdId, gameId);

      const doc = await loadPlayerDoc(userId, householdId, game._id);
      doc.sessions.push({
        playedOn: input.playedOn,
        minutes: input.minutes,
        platform: input.platform ?? null,
        note: input.note ?? '',
      });
      // Oldest out past the cap; their minutes are already in hoursPlayed.
      if (doc.sessions.length > MAX_SESSIONS) {
        const keep = sortSessions(doc.sessions.map((s) => s.toObject())).slice(0, MAX_SESSIONS);
        const keepIds = new Set(keep.map((s) => String(s._id)));
        doc.sessions = doc.sessions.filter((s) => keepIds.has(String(s._id)));
      }
      doc.hoursPlayed = roundHours((doc.hoursPlayed ?? 0) + input.minutes / 60);
      doc.lastPlayedAt = new Date();
      if (AUTO_PLAYING_FROM.includes(doc.shelf ?? null)) doc.shelf = 'playing';
      await doc.save();
      return withMe(game, doc);
    },

    deleteGameSession: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { gameId, sessionId } = validateDeleteGameSession(rawArgs);
      const game = await requireGame(householdId, gameId);

      const doc = await GamePlayer.findOne({ userId, householdId, gameId: game._id });
      const session = validObjectId(sessionId) ? doc?.sessions.id(sessionId) : null;
      if (!session) throw notFound('Session');
      // Deleting a mistaken log takes its minutes back out.
      doc.hoursPlayed = roundHours((doc.hoursPlayed ?? 0) - session.minutes / 60);
      session.deleteOne();
      await doc.save();
      return withMe(game, doc);
    },

    saveGamePlaythrough: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { gameId, input } = validateSaveGamePlaythrough(rawArgs);
      const game = await requireGame(householdId, gameId);

      const doc = await loadPlayerDoc(userId, householdId, game._id);
      const { id, ...fields } = input;
      const values = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) continue;
        values[k] = v === null && k === 'notes' ? '' : v;
      }
      if (id) {
        const existing = validObjectId(id) ? doc.playthroughs.id(id) : null;
        if (!existing) throw notFound('Playthrough');
        existing.set(values);
      } else {
        if (doc.playthroughs.length >= bounds.listMax.max) {
          throw userError(`At most ${bounds.listMax.max} playthroughs per game`);
        }
        doc.playthroughs.push(values);
      }
      await doc.save();
      return withMe(game, doc);
    },

    deleteGamePlaythrough: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { gameId, playthroughId } = validateDeleteGamePlaythrough(rawArgs);
      const game = await requireGame(householdId, gameId);

      const doc = await GamePlayer.findOne({ userId, householdId, gameId: game._id });
      const pt = validObjectId(playthroughId) ? doc?.playthroughs.id(playthroughId) : null;
      if (!pt) throw notFound('Playthrough');
      pt.deleteOne();
      await doc.save();
      return withMe(game, doc);
    },

    saveGameProfile: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { input } = validateSaveGameProfile(rawArgs);

      const set = {};
      if (input.platformsOwned !== undefined) set.platformsOwned = [...new Set(input.platformsOwned ?? [])];
      if (input.defaultPlatform !== undefined) set.defaultPlatform = input.defaultPlatform || null;
      if (input.steamId !== undefined) set.steamId = input.steamId || null;

      const update = { $setOnInsert: { householdId } };
      if (Object.keys(set).length) update.$set = set;
      return GameProfile.findOneAndUpdate({ userId }, update, { upsert: true, new: true, lean: true });
    },

    addGameShelf: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { label: rawLabel } = validateAddGameShelf(rawArgs);

      const label = String(rawLabel ?? '').trim().replace(/\s+/g, ' ');
      if (!label) throw userError('Shelf name is required');
      if (label.length > MAX_CUSTOM_SHELF_LABEL) {
        throw userError(`Shelf name must be ${MAX_CUSTOM_SHELF_LABEL} characters or fewer`);
      }
      const id = customShelfIdFromLabel(label);
      if (!id) throw userError('Shelf name needs at least one letter or number');

      const profile = await getOrCreateProfile(userId, householdId);
      const current = profile.customShelves ?? [];
      if (current.some((s) => s.id === id)) throw userError('You already have a shelf with that name', 'CONFLICT');
      if (current.length >= MAX_CUSTOM_SHELVES) {
        throw userError(`You can have up to ${MAX_CUSTOM_SHELVES} custom shelves`);
      }
      return GameProfile.findOneAndUpdate(
        { userId, 'customShelves.id': { $ne: id } },
        { $push: { customShelves: { id, label } } },
        { new: true, lean: true }
      ).then((p) => p ?? GameProfile.findOne({ userId }).lean());
    },

    removeGameShelf: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { id } = validateRemoveGameShelf(rawArgs);
      if (!String(id).startsWith(CUSTOM_SHELF_PREFIX)) {
        throw userError('Only custom shelves can be removed');
      }
      const pulled = await GameProfile.findOneAndUpdate(
        { userId, 'customShelves.id': id },
        { $pull: { customShelves: { id } } },
        { new: true, lean: true }
      );
      // Only the caller's own rows: another member's shelf of the same name is theirs.
      const cleared = await GamePlayer.updateMany({ userId, householdId, shelf: id }, { $set: { shelf: null } });
      const clearedGames = cleared?.modifiedCount ?? 0;
      return { success: Boolean(pulled) || clearedGames > 0, clearedGames };
    },

    saveGameFilter: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { input } = validateSaveGameFilter(rawArgs);

      const preset = {
        id: input.id || generateId(),
        name: input.name,
        sortBy: input.sortBy ?? 'title',
        sortDir: input.sortDir ?? 'asc',
        searchQuery: input.searchQuery ?? '',
        shelfFilter: input.shelfFilter ?? '',
        platformFilter: input.platformFilter ?? '',
        ownedFilter: input.ownedFilter || 'all',
      };

      const profile = await getOrCreateProfile(userId, householdId);
      const filters = profile.savedFilters ?? [];
      if (input.id && filters.some((f) => f.id === input.id)) {
        return GameProfile.findOneAndUpdate(
          { userId, 'savedFilters.id': input.id },
          { $set: { 'savedFilters.$': preset } },
          { new: true, lean: true }
        );
      }
      if (input.id) throw notFound('Saved filter');
      if (filters.length >= MAX_SAVED_FILTERS) {
        throw userError(`You can have up to ${MAX_SAVED_FILTERS} saved filters`);
      }
      return GameProfile.findOneAndUpdate({ userId }, { $push: { savedFilters: preset } }, { new: true, lean: true });
    },

    deleteGameFilter: async (_, rawArgs, { user } = {}) => {
      const userId = requireUser(user);
      const householdId = resolveHouseholdId(user);
      const { id } = validateDeleteGameFilter(rawArgs);
      await getOrCreateProfile(userId, householdId);
      return GameProfile.findOneAndUpdate({ userId }, { $pull: { savedFilters: { id } } }, { new: true, lean: true });
    },
  },
};
