/**
 * gamegeek/library.js — "what should I play next?" (DOCS/WHAT_NEXT_SPEC.md).
 *
 * The shape is BookGeek's `library.js` moved onto the catalog vectors:
 * the candidate set is COMPUTED (owned household games the caller hasn't
 * played), a local shortlist of at most 20 is built from five taste seeds
 * by `catalogSemantic.shortlistFromSeeds`, and ONE model call — through
 * `services/aiFeatureRunner.js` as `{ app: 'gamegeek', feature: 'whatnext' }` —
 * only ranks and explains what it is handed. `validatePicks` refuses any id
 * outside the shortlist; every refusal settles on the deterministic
 * fallback, which is the shortlist's own order with a "because you loved X"
 * reason — so an off, capped or unreachable model still answers.
 *
 * Unlike BookGeek, the model MAY use outside knowledge about games
 * (WHAT_NEXT_SPEC §2): how they play, how long they run, their reputation.
 * So the payload sends no descriptions — titles, genres, tags, year,
 * hours-to-beat and which loved game each candidate resembles. Reviews,
 * notes, sessions and GamePlayer data of anyone else's never leave the box.
 *
 * No vectors or no seeds yet → the pre-vector answer: the 20 most recently
 * added owned-unplayed games, sent to the same model with the same rules.
 *
 * ## Opt-in
 *
 * `appPreferences.gamegeek.playAssistant`, default off — written by the
 * GameGeek settings switch through `PATCH /api/users/preferences/gamegeek`,
 * read lazily here the way `libraryAssistantEnabled` reads BookGeek's. Off
 * means the deterministic fallback with `provenance.reason = 'disabled'`
 * and no model call; the server-side check is the one that counts.
 */

import logger from '../../lib/logger.js';
import { runAIFeature } from '../../services/aiFeatureRunner.js';
import { Game } from './models/game.js';
import { GamePlayer } from './models/gamePlayer.js';
import { catalogVectors, shortlistFromSeeds, moodQueryVector } from '../catalog/catalogSemantic.js';

export const GAME_APP = 'gamegeek';
export const GAME_FEATURE = 'whatnext';
export const GAME_DAILY_CAP = 20;

export const MAX_PICKS = 10;
export const MAX_WHY_CHARS = 160;
/** Live calls run 3–6 s; the default 6 s cut a mood call on the wire. */
export const WHAT_NEXT_TIMEOUT_MS = 12000;
/** Mood text in a fallback `why` is capped, like every other borrowed phrase. */
export const MAX_MOOD_WHY_CHARS = 40;
export const SHORTLIST_SIZE = 20;
export const SEED_COUNT = 5;
export const LOVED_SEEDS = 3;
export const RECENT_SEEDS = 2;
/** The pre-vector path still only sends this many candidates to the model. */
export const PRE_VECTOR_CANDIDATES = 20;

// ---------------------------------------------------------------------------
// The computed halves
// ---------------------------------------------------------------------------

/**
 * The five taste seeds (X1), chosen from the caller's GamePlayer rows.
 *
 *   loved  — favorite, rated ≥4, or ≥5 hours played; ordered favorite first,
 *            then rating (unrated last), then hours; up to 3.
 *   recent — most recently played (lastPlayedAt), not already chosen; up to 2.
 *
 * A short pool is topped up from the other to 5 total. Only gameIds with a
 * vector in the scope count — `vectorIds` is filtered against BEFORE taking,
 * so a missing vector never wastes a slot.
 *
 * Pure over rows; the DB read is `whatNextSeeds`.
 */
export function pickGameSeeds(rows, vectorIds) {
  const eligible = (Array.isArray(rows) ? rows : []).filter((r) => vectorIds.has(String(r.gameId)));
  const loved = eligible
    .filter((r) => r.favorite || (r.rating ?? 0) >= 4 || (r.hoursPlayed ?? 0) >= 5)
    .sort(
      (a, b) =>
        Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) ||
        (b.rating ?? -1) - (a.rating ?? -1) ||
        (b.hoursPlayed ?? 0) - (a.hoursPlayed ?? 0),
    );
  const recent = eligible
    .filter((r) => r.lastPlayedAt)
    .sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt));

  const chosen = [];
  const seen = new Set();
  const take = (pool, n, why) => {
    let left = n;
    for (const row of pool) {
      if (left <= 0) break;
      const id = String(row.gameId);
      if (seen.has(id)) continue;
      seen.add(id);
      chosen.push({ id, why, row });
      left -= 1;
    }
  };
  take(loved, LOVED_SEEDS, 'loved');
  take(recent, RECENT_SEEDS, 'recent');
  take(loved, SEED_COUNT - chosen.length, 'loved');
  take(recent, SEED_COUNT - chosen.length, 'recent');
  return chosen.slice(0, SEED_COUNT);
}

/**
 * Owned household games the caller hasn't really played — the same rule
 * `gamesLike` uses (X5): no GamePlayer row at all, or a zero-hour row on no
 * shelf / the backlog shelf. `excludeIds` drops seeds. Ids only.
 */
export async function unplayedGameIds({ userId, householdId, excludeIds = new Set() }) {
  const [mine, owned] = await Promise.all([
    GamePlayer.find({ userId, householdId }, { gameId: 1, shelf: 1, hoursPlayed: 1 }).lean(),
    Game.find({ householdId, owned: true }, { _id: 1 }).lean(),
  ]);
  const myRow = new Map(mine.map((r) => [String(r.gameId), r]));
  return owned
    .filter((g) => {
      const id = String(g._id);
      if (excludeIds.has(id)) return false;
      const row = myRow.get(id);
      if (!row) return true;
      return (row.hoursPlayed || 0) === 0 && (row.shelf == null || row.shelf === 'backlog');
    })
    .map((g) => String(g._id));
}

/** The caller's five seeds (X1), already restricted to indexed games. */
export async function whatNextSeeds({ userId, householdId }) {
  const [rows, vecs] = await Promise.all([
    GamePlayer.find(
      { userId, householdId },
      { gameId: 1, favorite: 1, rating: 1, hoursPlayed: 1, lastPlayedAt: 1 },
    ).lean(),
    catalogVectors('game', householdId),
  ]);
  return pickGameSeeds(rows, new Set(vecs.map((v) => v.itemId)));
}

// ---------------------------------------------------------------------------
// gameWhatNext
// ---------------------------------------------------------------------------

const GAME_WHAT_NEXT_SCHEMA = {
  name: 'GameWhatNext',
  description: 'A ranked short list of candidate game ids with a one-line reason each.',
  schema: {
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            gameId: { type: 'string' },
            why: { type: 'string' },
          },
          required: ['gameId', 'why'],
          additionalProperties: false,
        },
      },
    },
    required: ['picks'],
    additionalProperties: false,
  },
};

export const GAME_WHAT_NEXT_SYSTEM_PROMPT = `You help one person choose what to play next from games they already own.

You are given JSON with:
- "seeds": up to five games from their library that say what they like —
  "why" is "loved" (a favourite, a high rating, or many hours) or "recent"
  (played lately), with the rating and hours they gave it.
- "candidates": games they own but have NOT really played. Each has an "id",
  "title", "genres", "tags", "year", "hoursToBeat", "modes" and "because" —
  the title of the seed this candidate most resembles, or null when the
  candidate came from the mood rather than a seed.
- "limit": how many picks to return.
- "mood": an optional short phrase for what they feel like right now
  ("short", "co-op", "chill"). Absent when they gave none.

Rules, in order of importance:
1. Return at most "limit" picks, each a DISTINCT "gameId" copied verbatim
   from a candidate's "id". Never invent an id. Never return an id that is
   not in "candidates". Fewer picks is fine; wrong ids are not.
2. Order them best first.
3. "why" is ONE short sentence, at most 90 characters, addressed to them.
4. You MAY use what you know about these games — how they play, how long
   they run, their reputation. Mention a seed in "why" only when the
   resemblance is real and specific; otherwise say what makes the game
   itself a good pick. Never claim a likeness you would not stand behind.
5. When "mood" is given it outranks the seeds: every pick should fit it,
   and "why" should say how. For length-related moods ("short", "quick",
   "long") use "hoursToBeat" when known and what you know of the game when
   it is null.
6. Prefer variety across the picks — five versions of the same game is not
   a library's worth of options.`;

/** Ids the model returned must be ids we handed it — and each only once. */
export function validateGamePicks(data, allowedIds, limit) {
  if (!data || !Array.isArray(data.picks)) return false;
  if (data.picks.length > limit) return false;
  const seen = new Set();
  for (const pick of data.picks) {
    if (!pick || typeof pick.gameId !== 'string') return false;
    if (!allowedIds.has(pick.gameId)) return false;
    if (seen.has(pick.gameId)) return false;
    seen.add(pick.gameId);
    if (pick.why != null && typeof pick.why !== 'string') return false;
  }
  return true;
}

/** The trimmed snapshot the model sees (X6). No descriptions, ever. */
export function gameWhatNextContext({ seedDocs, candidateDocs, becauseById, mood, limit }) {
  return {
    limit,
    mood: mood || null,
    seeds: seedDocs.map(({ doc, why, row }) => ({
      title: doc?.title || 'Untitled',
      genres: doc?.genres || [],
      rating: row?.rating ?? null,
      hoursPlayed: row?.hoursPlayed ?? 0,
      why,
    })),
    candidates: candidateDocs.map((doc) => ({
      id: String(doc._id),
      title: doc.title || 'Untitled',
      genres: doc.genres || [],
      tags: [...new Set([...(doc.tags || []), ...(doc.autoTags || [])])].slice(0, 5),
      year: doc.releaseDate ? new Date(doc.releaseDate).getUTCFullYear() : null,
      hoursToBeat: doc.timeToBeat?.main ?? null,
      modes: doc.modes || [],
      because: becauseById?.get(String(doc._id)) ?? null,
    })),
  };
}

/** The deterministic answer: the shortlist's own order, with its reasons. */
export function fallbackGamePicks(shortlist, seedMetaById, limit, preVector, mood) {
  return shortlist.slice(0, limit).map((entry) => {
    let why;
    if (entry.mood && mood) {
      why = `Fits your mood: "${ String(mood).slice(0, MAX_MOOD_WHY_CHARS) }".`;
    } else if (preVector || !entry.because) {
      why = 'One of the most recent additions to your library.';
    } else {
      const seed = seedMetaById.get(entry.because);
      why = entry.why === 'recent'
        ? `Because you've been playing ${ seed?.title ?? 'it' }.`
        : `Because you loved ${ seed?.title ?? 'it' }.`;
    }
    return { gameId: entry.id, why };
  });
}

function normalizeGamePicks(picks, limit, byId) {
  return (Array.isArray(picks) ? picks : [])
    .slice(0, limit)
    .map((pick) => {
      const gameId = String(pick.gameId);
      return {
        gameId,
        game: byId.get(gameId) || null,
        why: typeof pick.why === 'string' ? pick.why.trim().slice(0, MAX_WHY_CHARS) : null,
      };
    })
    .filter((pick) => pick.game);
}

function disabledProvenance(reason) {
  return {
    source: 'fallback',
    reason,
    model: null,
    provider: null,
    cached: false,
    callsToday: 0,
    cap: GAME_DAILY_CAP,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.householdId
 * @param {string} [opts.mood]     an optional steering phrase (X4)
 * @param {number} opts.limit
 * @param {boolean} opts.enabled   the caller's opt-in switch
 */
export async function gameWhatNext({ userId, householdId, mood, limit, enabled }) {
  const seeds = await whatNextSeeds({ userId, householdId });
  const seedIds = seeds.map((s) => s.id);
  const candidateIds = await unplayedGameIds({ userId, householdId, excludeIds: new Set(seedIds) });

  // The shortlist, when the vectors can give one: X3 round-robin over the
  // seeds, steered by the mood's vector. No vectors or no seeds → the
  // pre-vector answer: the newest owned-unplayed games instead.
  const moodVec = await moodQueryVector(mood, logger);
  const shortlist = seedIds.length
    ? await shortlistFromSeeds({
        kind: 'game',
        scope: householdId,
        seedIds,
        candidateIds,
        moodVec,
        size: SHORTLIST_SIZE,
      })
    : [];

  let orderedIds;
  let becauseById;
  if (shortlist.length) {
    orderedIds = shortlist.map((s) => s.id);
    becauseById = new Map(shortlist.map((s) => [s.id, s.because]));
  } else {
    const recent = await Game.find({ _id: { $in: candidateIds }, householdId }, { _id: 1, createdAt: 1 })
      .sort({ createdAt: -1, _id: -1 })
      .limit(PRE_VECTOR_CANDIDATES)
      .lean();
    orderedIds = recent.map((g) => String(g._id));
    becauseById = null;
  }

  const docIds = [...new Set([...orderedIds, ...seedIds])];
  const docs = docIds.length ? await Game.find({ _id: { $in: docIds }, householdId }).lean() : [];
  const byId = new Map(docs.map((g) => [String(g._id), g]));
  const candidateDocs = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  const seedDocs = seeds
    .map((s) => ({ doc: byId.get(s.id), why: s.why, row: s.row }))
    .filter((s) => s.doc);

  const seedMetaById = new Map(seeds.map((s) => [s.id, { title: byId.get(s.id)?.title, why: s.why }]));

  // Translate `because` seed ids into seed titles for the payload, and keep
  // the seed's loved/recent tag for the fallback reasons.
  const becauseTitleById = becauseById
    ? new Map([...becauseById].map(([candId, seedId]) => [candId, seedMetaById.get(seedId)?.title ?? null]))
    : null;
  const preVector = !becauseById;

  const moodById = new Map(shortlist.map((s) => [s.id, s.mood === true]));
  const shortlistEntries = orderedIds.map((id) => ({
    id,
    because: becauseById?.get(id) ?? null,
    why: becauseById ? seedMetaById.get(becauseById.get(id))?.why ?? 'loved' : null,
    mood: moodById.get(id) ?? false,
  }));

  const fallback = () => ({
    picks: fallbackGamePicks(shortlistEntries, seedMetaById, limit, preVector, mood),
  });

  let result;
  if (!candidateDocs.length) {
    result = { data: { picks: [] }, provenance: disabledProvenance('no_candidates') };
  } else if (!enabled) {
    result = { data: fallback(), provenance: disabledProvenance('disabled') };
  } else {
    const allowedIds = new Set(candidateDocs.map((g) => String(g._id)));
    result = await runAIFeature({
      app: GAME_APP,
      feature: GAME_FEATURE,
      userId,
      system: GAME_WHAT_NEXT_SYSTEM_PROMPT,
      user: JSON.stringify(
        gameWhatNextContext({ seedDocs, candidateDocs, becauseById: becauseTitleById, mood, limit }),
      ),
      schema: GAME_WHAT_NEXT_SCHEMA,
      validate: (data) => validateGamePicks(data, allowedIds, limit),
      fallback,
      maxTokens: 350,
      maxCallsPerDay: GAME_DAILY_CAP,
      timeoutMs: WHAT_NEXT_TIMEOUT_MS,
    });
  }

  const picks = normalizeGamePicks(result.data?.picks, limit, byId);
  logger.info(
    {
      metric: 'gamegeek.library.whatnext_shown',
      userId,
      picks: picks.length,
      candidates: candidateDocs.length,
      seeds: seedDocs.length,
      source: result.provenance.source,
      reason: result.provenance.reason,
    },
    '[gamegeek] what-next shelf served',
  );
  return { picks, provenance: result.provenance };
}

// ---------------------------------------------------------------------------
// The opt-in switch
// ---------------------------------------------------------------------------

/**
 * `appPreferences.gamegeek.playAssistant`, default false. The User model is
 * imported lazily for the same reason as BookGeek's: it opens its own
 * userGeek connection at module load, and paying for it only when someone
 * asks for suggestions keeps the import graph where it was.
 */
export async function playAssistantEnabled(userId) {
  if (!userId) return false;
  try {
    const [{ User }, { getAppPreferences }] = await Promise.all([
      import('../../models/user.js'),
      import('../../lib/appPreferences.js'),
    ]);
    const user = await User.findById(userId).select('appPreferences');
    if (!user) return false;
    return getAppPreferences(user, 'gamegeek').playAssistant === true;
  } catch (err) {
    logger.warn({ err, userId }, '[gamegeek] play-assistant preference read failed; treating as off');
    return false;
  }
}
