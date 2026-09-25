/**
 * Enrich one game (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md).
 *
 * enrichGame()      runs the providers in the spec's order, strict-matches,
 *                   fills empty fields and the cover, records the attempt.
 * applyCandidate()  a person picked a candidate: same fill rules, manual.
 * unlinkGame()      undoes what enrichment wrote and parks the game.
 * listCandidates()  every configured provider's raw search, unfiltered.
 *
 * Writes: one updateOne per attempt, filtered on the `updatedAt` it read
 * (so a concurrent edit, import or upload makes it match nothing) AND on
 * each field it fills still being empty. A miss re-reads, re-plans and
 * tries again, so a field someone filled meanwhile is never overwritten.
 * Every read and write is scoped `{_id, householdId}`.
 *
 * All I/O arrives in `deps`, so tests run this against fakes:
 *   Game       { findOne(f).lean(), find(f, proj).lean(), updateOne(f, u) }
 *   providers  createProviders() output ({ordered, searchable, byName})
 *   fetchCover(urls) → {buffer, ext} | null
 *   writeCover(gameId, ext, buffer) → filename
 *   deleteCover(filename)
 *   now() → Date, logger
 */
import { matchCandidates, yearOf, yearsCompatible } from './match.js';
import { planFill, planUnlink, emptyFilter } from './plan.js';

export const MAX_WRITE_ATTEMPTS = 3;
const ERROR_MAX = 300;

const WORKER_SKIP_STATUSES = new Set(['unlinked', 'matched']);

const nowOf = (deps) => (deps.now ? deps.now() : new Date());

async function readGame(Game, id, householdId) {
  return Game.findOne({ _id: id, householdId }).lean();
}

/** The optimistic-lock filter: the document is unchanged since we read it. */
function lockFilter(game) {
  return { _id: game._id, householdId: game.householdId, updatedAt: game.updatedAt ?? null };
}

function shortError(err) {
  const msg = String(err?.message || err || 'error').replace(/[?&]key=[^&\s]+/gi, '');
  return msg.slice(0, ERROR_MAX);
}

function isDuplicateKey(err) {
  return (err?.code ?? err?.err?.code) === 11000;
}

/** External ids in `ids` already held by ANOTHER game in the household. */
async function findTakenIds(Game, game, ids = {}) {
  const or = [];
  for (const key of ['steamAppId', 'igdb', 'rawg']) {
    if (ids[key]) or.push({ [`externalIds.${key}`]: String(ids[key]) });
  }
  const taken = { steamAppId: new Set(), igdb: new Set(), rawg: new Set() };
  if (!or.length) return taken;
  const rows = await Game.find({ householdId: game.householdId, _id: { $ne: game._id }, $or: or }, { externalIds: 1 }).lean();
  for (const row of rows ?? []) {
    for (const key of Object.keys(taken)) if (row.externalIds?.[key]) taken[key].add(String(row.externalIds[key]));
  }
  return taken;
}

/** Treat every one of the detail's ids as taken — the last-resort retry after duplicate-key races. */
function allTaken(ids = {}) {
  const set = (v) => new Set(v ? [String(v)] : []);
  return { steamAppId: set(ids.steamAppId), igdb: set(ids.igdb), rawg: set(ids.rawg) };
}

const union = (a = [], b = []) => [...new Set([...(a ?? []), ...(b ?? [])])];

/** Merge a detail over its search candidate: the detail wins where it has a value. */
function mergeDetail(candidate, detail) {
  const out = { ...candidate };
  for (const [k, v] of Object.entries(detail ?? {})) {
    const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (!empty) out[k] = v;
  }
  out.externalIds = { ...(candidate?.externalIds ?? {}), ...(detail?.externalIds ?? {}) };
  return out;
}

/**
 * Write a matched provider detail onto the game: planFill's empty fields,
 * the cover when the game has none, and a `matched` enrichment record.
 * Retries on a lock miss; returns the enrichment written, or null when the
 * game vanished.
 */
export async function applyMatch(gameIn, providerName, detail, deps, { manual = false, providersTried = [] } = {}) {
  const { Game, logger } = deps;
  let game = gameIn;
  let cover; // downloaded at most once across retries
  let dropIds = false;

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    if (!game) return null;
    const takenIds = dropIds ? allTaken(detail.externalIds) : await findTakenIds(Game, game, detail.externalIds);
    const plan = planFill(game, detail, { takenIds });
    const set = { ...plan.set };
    const filled = [...plan.filled];
    const hashes = { ...plan.hashes };

    let coverFile = null;
    if (!game.coverPath && Array.isArray(detail.coverUrls) && detail.coverUrls.length && deps.fetchCover) {
      if (cover === undefined) cover = (await deps.fetchCover(detail.coverUrls)) ?? null;
      if (cover) {
        coverFile = `${game._id}.${cover.ext}`;
        set.coverPath = coverFile;
        filled.push('coverPath');
      }
    }
    if (plan.addPlatforms.length) filled.push('platformsAvailable');

    const prev = game.enrichment ?? {};
    const now = nowOf(deps);
    const enrichment = {
      status: 'matched',
      provider: providerName,
      providerId: String(detail.providerId),
      matchedTitle: String(detail.title ?? '').slice(0, 300) || null,
      filled: union(prev.filled, filled),
      filledHashes: { ...(prev.filledHashes ?? {}), ...hashes },
      addedPlatforms: union(prev.addedPlatforms, plan.addPlatforms),
      coverFromEnrichment: Boolean(prev.coverFromEnrichment || coverFile),
      manual: Boolean(manual || prev.manual),
      attempts: (prev.attempts ?? 0) + 1,
      lastTriedAt: now,
      matchedAt: now,
      error: null,
      providersTried: union([], providersTried),
    };

    const filter = lockFilter(game);
    for (const path of Object.keys(set)) Object.assign(filter, emptyFilter(path));
    const update = { $set: { ...set, enrichment } };
    if (plan.addPlatforms.length) update.$addToSet = { platformsAvailable: { $each: plan.addPlatforms } };

    let res;
    try {
      res = await Game.updateOne(filter, update);
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // Another game took one of these ids between our check and the write.
      if (attempt === MAX_WRITE_ATTEMPTS - 2) dropIds = true;
      game = await readGame(Game, game._id, game.householdId);
      continue;
    }

    if ((res?.matchedCount ?? res?.n ?? 0) > 0) {
      if (coverFile) {
        try {
          await deps.writeCover(String(game._id), cover.ext, cover.buffer);
        } catch (err) {
          logger?.warn?.({ err: err?.message }, 'enrichment: cover write failed; clearing coverPath');
          await Game.updateOne(
            { _id: game._id, householdId: game.householdId, coverPath: coverFile },
            { $set: { coverPath: null, 'enrichment.coverFromEnrichment': Boolean(prev.coverFromEnrichment) }, $pull: { 'enrichment.filled': 'coverPath' } }
          );
        }
      }
      return enrichment;
    }
    // Lock miss: something changed the game since we read it. Re-read and re-plan.
    game = await readGame(Game, game._id, game.householdId);
  }
  logger?.warn?.({ gameId: String(gameIn?._id) }, 'enrichment: gave up after repeated concurrent changes');
  return null;
}

/** Record a non-match attempt (no-match / ambiguous / error). */
async function recordAttempt(gameIn, outcome, deps, { mode }) {
  const { Game } = deps;
  let game = gameIn;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    if (!game) return null;
    if (mode === 'worker' && WORKER_SKIP_STATUSES.has(game.enrichment?.status)) return game.enrichment;
    const prev = game.enrichment ?? {};
    const enrichment = {
      ...defaultEnrichment(),
      ...prev,
      status: outcome.status,
      attempts: (prev.attempts ?? 0) + 1,
      lastTriedAt: nowOf(deps),
      error: outcome.error ?? null,
      providersTried: outcome.providersTried,
    };
    const res = await Game.updateOne(lockFilter(game), { $set: { enrichment } });
    if ((res?.matchedCount ?? res?.n ?? 0) > 0) return enrichment;
    game = await readGame(Game, game._id, game.householdId);
  }
  return null;
}

export function defaultEnrichment() {
  return {
    status: 'pending',
    provider: null,
    providerId: null,
    matchedTitle: null,
    filled: [],
    filledHashes: null,
    addedPlatforms: [],
    coverFromEnrichment: false,
    manual: false,
    attempts: 0,
    lastTriedAt: null,
    matchedAt: null,
    error: null,
    providersTried: [],
  };
}

/**
 * Run the providers for one game and write the outcome.
 *
 * @param {object} gameRef `{_id, householdId}` (the game is re-read fresh).
 * @param {object} deps see file header.
 * @param {{mode?: 'worker'|'refresh'}} [options] the worker never touches an
 *   unlinked, matched or manual game; a person's refresh may.
 * @returns {Promise<{outcome: string, enrichment: object|null}>}
 */
export async function enrichGame(gameRef, deps, { mode = 'worker' } = {}) {
  const { Game, providers, logger } = deps;
  const game = await readGame(Game, gameRef._id, gameRef.householdId);
  if (!game) return { outcome: 'missing', enrichment: null };
  if (mode === 'worker' && (WORKER_SKIP_STATUSES.has(game.enrichment?.status) || game.enrichment?.manual)) {
    return { outcome: 'skipped', enrichment: game.enrichment };
  }

  const tried = [];
  const errors = [];
  let ambiguous = false;
  let match = null;
  const gameYear = yearOf(game.releaseDate);

  for (const p of providers.ordered) {
    if (!p.isConfigured() || !p.appliesTo(game)) continue;
    if (!tried.includes(p.name)) tried.push(p.name);
    try {
      if (p.idFor) {
        const detail = await p.detail(p.idFor(game));
        if (detail) {
          match = { name: p.name, detail };
          break;
        }
        continue;
      }
      const result = matchCandidates(game, await p.search(game.title));
      if (result.status === 'ambiguous') {
        ambiguous = true;
        continue;
      }
      if (result.status !== 'matched') continue;
      const detail = await p.detail(result.candidate.providerId);
      if (!detail) continue;
      // The detail can carry a year the search result lacked (Steam's search has none).
      if (!yearsCompatible(gameYear, yearOf(detail.releaseDate))) continue;
      match = { name: p.name, detail: mergeDetail(result.candidate, detail) };
      break;
    } catch (err) {
      errors.push(`${p.step}: ${shortError(err)}`);
      logger?.warn?.({ step: p.step, err: shortError(err) }, 'enrichment: provider failed');
    }
  }

  if (match) {
    const enrichment = await applyMatch(game, match.name, match.detail, deps, { providersTried: tried });
    return { outcome: enrichment ? 'matched' : 'conflict', enrichment };
  }

  const status = errors.length ? 'error' : ambiguous ? 'ambiguous' : 'no-match';
  const enrichment = await recordAttempt(
    game,
    { status, providersTried: tried, error: errors.length ? errors.join('; ').slice(0, ERROR_MAX) : null },
    deps,
    { mode }
  );
  return { outcome: status, enrichment };
}

/**
 * A person chose `{provider, providerId}`. Same fill-only-empty rules;
 * status `matched`, `manual: true` (the worker leaves it alone after).
 * @returns {Promise<{error?: string, enrichment?: object}>}
 */
export async function applyCandidate(gameRef, { provider, providerId }, deps) {
  const { Game, providers } = deps;
  const p = providers.byName[provider];
  if (!p || !p.isConfigured()) return { error: 'provider-unavailable' };
  const game = await readGame(Game, gameRef._id, gameRef.householdId);
  if (!game) return { error: 'not-found' };
  const detail = await p.detail(String(providerId));
  if (!detail) return { error: 'candidate-not-found' };
  const enrichment = await applyMatch(game, p.name, detail, deps, {
    manual: true,
    providersTried: union(game.enrichment?.providersTried, [p.name]),
  });
  return enrichment ? { enrichment } : { error: 'conflict' };
}

/**
 * Clear what enrichment wrote (planUnlink decides which fields still hold
 * enrichment's values), delete an enrichment cover, set status `unlinked`.
 * @returns {Promise<{enrichment: object, cleared: string[], kept: string[]}|null>}
 */
export async function unlinkGame(gameRef, deps) {
  const { Game, logger } = deps;
  let game = await readGame(Game, gameRef._id, gameRef.householdId);
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    if (!game) return null;
    const plan = planUnlink(game);
    const prev = game.enrichment ?? {};
    const enrichment = {
      ...defaultEnrichment(),
      attempts: prev.attempts ?? 0,
      lastTriedAt: prev.lastTriedAt ?? null,
      providersTried: prev.providersTried ?? [],
      status: 'unlinked',
    };
    const update = { $set: { ...plan.set, enrichment } };
    if (plan.pullPlatforms.length) update.$pullAll = { platformsAvailable: plan.pullPlatforms };
    const res = await Game.updateOne(lockFilter(game), update);
    if ((res?.matchedCount ?? res?.n ?? 0) > 0) {
      if (plan.clearCover && game.coverPath && deps.deleteCover) {
        try {
          await deps.deleteCover(game.coverPath);
        } catch (err) {
          logger?.warn?.({ err: err?.message }, 'enrichment: cover delete failed on unlink');
        }
      }
      return { enrichment, cleared: plan.cleared, kept: plan.kept };
    }
    game = await readGame(Game, game._id, game.householdId);
  }
  return null;
}

/**
 * Every configured provider's search for this game's title, unfiltered, each
 * row flagged with whether the strict matcher would pick it.
 */
export async function listCandidates(game, deps) {
  const { providers, logger } = deps;
  const candidates = [];
  const errors = [];
  for (const p of providers.searchable) {
    if (!p.isConfigured()) continue;
    try {
      const results = await p.search(game.title);
      const verdict = matchCandidates(game, results);
      const pick = verdict.status === 'matched' ? verdict.candidate.providerId : null;
      for (const c of results) {
        candidates.push({
          provider: p.name,
          providerId: String(c.providerId),
          title: c.title,
          year: yearOf(c.releaseDate),
          coverUrl: c.coverUrl ?? null,
          platforms: c.platforms ?? [],
          wouldMatch: pick != null && String(c.providerId) === String(pick),
        });
      }
    } catch (err) {
      errors.push({ provider: p.name, message: 'Provider unavailable' });
      logger?.warn?.({ step: p.step, err: shortError(err) }, 'enrichment: candidate search failed');
    }
  }
  return { candidates, errors };
}

export default { enrichGame, applyMatch, applyCandidate, unlinkGame, listCandidates, defaultEnrichment };
