/**
 * The tags pass (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §A4).
 *
 * For a MATCHED game with no `enrichment.tagsFetchedAt`, gather raw tag
 * terms from the providers, map them through the canonical vocabulary
 * (@geeksuite/schemas/gamegeek/tags) and write `autoTags`,
 * `enrichment.tagsFetchedAt` and `enrichment.tagSources`.
 *
 * Where the terms come from, in order:
 *   1. the game has an IGDB id           → IGDB themes, keywords, perspectives;
 *   2. no IGDB id but a steamAppId       → IGDB `external_games` (Steam uid)
 *                                          gives the IGDB id; store it when it
 *                                          is free in the household, then 1;
 *   3. the game has a RAWG id            → RAWG's English tags, too;
 *   4. none of the above                 → IGDB title search through the SAME
 *                                          strict matcher; an exact match
 *                                          gives the IGDB id, then 1.
 *
 * `autoTags` is replaced only while it is empty or still holds what
 * enrichment wrote (its `filledHashes.autoTags` fingerprint, the same rule an
 * unlink uses). The user's own `tags` are never read or written here.
 *
 * Writes are guarded exactly like enrichGame's: one updateOne filtered on the
 * `updatedAt` it read (plus "still empty" for an IGDB id it fills); a miss
 * re-reads and retries. A source that throws means nothing is written for
 * that game, so the next run tries again.
 *
 * deps: { Game, providers: { tags }, now(), logger } — providers.tags is the
 * interface built in providers.js; absent (as in the older fakes) = no-op.
 */
import constantsModule from '@geeksuite/schemas/gamegeek/constants';
import { matchCandidates } from './match.js';
import { valueHash } from './plan.js';

const { mapProviderTags } = constantsModule;

export const MAX_TAG_WRITE_ATTEMPTS = 3;
export const TAGS_BATCH_SIZE = 50;

const nowOf = (deps) => (deps.now ? deps.now() : new Date());
const isDigits = (v) => /^\d+$/.test(String(v ?? ''));
const hasId = (v) => v != null && v !== '';
const union = (a = [], b = []) => [...new Set([...(a ?? []), ...(b ?? [])])];

/** The Mongo filter for games the tags pass should visit. */
export function tagsSelectionFilter() {
  return { 'enrichment.status': 'matched', 'enrichment.tagsFetchedAt': null };
}

/** True while `autoTags` is empty or still exactly what enrichment wrote. */
export function canReplaceAutoTags(game) {
  const current = Array.isArray(game?.autoTags) ? game.autoTags : [];
  if (current.length === 0) return true;
  const recorded = game?.enrichment?.filledHashes?.autoTags;
  return Boolean(recorded) && valueHash(current) === recorded;
}

async function readGame(Game, id, householdId) {
  return Game.findOne({ _id: id, householdId }).lean();
}

/**
 * Gather the raw terms for one game.
 * @param {object} game
 * @param {object} tags providers.tags
 * @param {object} [ctx]
 * @param {object} [ctx.cache] batch prefetch: { igdbTags: Map, igdbFetched: Set, steamToIgdb: Map, steamLooked: Set }
 * @param {object} [ctx.prefetched] from an inline match: { igdb?: {id, terms}, rawg?: {id, terms} }
 * @returns {Promise<{terms: string[], sources: string[], igdbIdToStore: string|null, consulted: boolean}>}
 */
export async function collectTagTerms(game, tags, { cache = {}, prefetched = {} } = {}) {
  const igdbOn = tags.igdbConfigured();
  const rawgOn = tags.rawgConfigured();
  const terms = [];
  const sources = [];
  let consulted = false;
  let igdbIdToStore = null;

  let igdbId = hasId(game.externalIds?.igdb) ? String(game.externalIds.igdb) : null;
  const steamAppId = isDigits(game.externalIds?.steamAppId) ? String(game.externalIds.steamAppId) : null;
  const rawgId = hasId(game.externalIds?.rawg) ? String(game.externalIds.rawg) : null;

  // 2. Steam uid → IGDB id.
  if (!igdbId && steamAppId && igdbOn) {
    let found;
    if (cache.steamLooked?.has(steamAppId)) found = cache.steamToIgdb?.get(steamAppId) ?? null;
    else found = (await tags.igdbIdsBySteam([steamAppId])).get(steamAppId) ?? null;
    consulted = true;
    if (found) {
      igdbId = String(found);
      igdbIdToStore = igdbId;
    }
  }

  // 4. Nothing to go on: strict IGDB title search.
  if (!igdbId && !rawgId && igdbOn) {
    const verdict = matchCandidates(game, await tags.igdbSearch(game.title));
    consulted = true;
    if (verdict.status === 'matched' && isDigits(verdict.candidate.providerId)) {
      igdbId = String(verdict.candidate.providerId);
      igdbIdToStore = igdbId;
    }
  }

  // 1. IGDB themes / keywords / perspectives.
  if (igdbId && igdbOn) {
    let got;
    if (prefetched.igdb && String(prefetched.igdb.id) === igdbId) got = prefetched.igdb.terms ?? [];
    else if (cache.igdbFetched?.has(igdbId)) got = cache.igdbTags?.get(igdbId) ?? null;
    else got = (await tags.igdbTagsByIds([igdbId])).get(igdbId) ?? null;
    consulted = true;
    if (got) {
      terms.push(...got);
      sources.push('igdb');
    }
  }

  // 3. RAWG's English tags.
  if (rawgId && rawgOn) {
    let got;
    if (prefetched.rawg && String(prefetched.rawg.id) === rawgId) got = prefetched.rawg.terms ?? [];
    else got = await tags.rawgTags(rawgId);
    consulted = true;
    if (got) {
      terms.push(...got);
      sources.push('rawg');
    }
  }

  return { terms, sources, igdbIdToStore, consulted };
}

/**
 * Write the pass's result with guarded retries.
 * @returns {Promise<{written: boolean, autoTags: string[]|null, keptUserSet?: boolean}>}
 */
async function writeTags(gameIn, result, deps) {
  const { Game } = deps;
  const autoTags = mapProviderTags(result.terms);
  let game = gameIn;
  let dropId = false;

  for (let attempt = 0; attempt < MAX_TAG_WRITE_ATTEMPTS; attempt += 1) {
    if (!game || game.enrichment?.status !== 'matched') return { written: false, autoTags: null };
    const prev = game.enrichment ?? {};
    const filled = [...(prev.filled ?? [])];
    const hashes = { ...(prev.filledHashes ?? {}) };
    const set = {
      'enrichment.tagsFetchedAt': nowOf(deps),
      'enrichment.tagSources': union([], result.sources),
    };
    const filter = { _id: game._id, householdId: game.householdId, updatedAt: game.updatedAt ?? null };

    const replace = canReplaceAutoTags(game);
    if (replace) {
      set.autoTags = autoTags;
      if (!filled.includes('autoTags')) filled.push('autoTags');
      hashes.autoTags = valueHash(autoTags);
    }

    const id = result.igdbIdToStore;
    if (id && !dropId && !hasId(game.externalIds?.igdb)) {
      const taken = await Game.findOne(
        { householdId: game.householdId, _id: { $ne: game._id }, 'externalIds.igdb': id },
        { _id: 1 }
      ).lean();
      if (!taken) {
        set['externalIds.igdb'] = id;
        filter['externalIds.igdb'] = { $in: [null, ''] };
        if (!filled.includes('externalIds.igdb')) filled.push('externalIds.igdb');
        hashes['externalIds.igdb'] = valueHash(id);
      }
    }
    set['enrichment.filled'] = filled;
    set['enrichment.filledHashes'] = hashes;

    let res;
    try {
      res = await Game.updateOne(filter, { $set: set });
    } catch (err) {
      if ((err?.code ?? err?.err?.code) !== 11000) throw err;
      // Another game took the IGDB id between our check and the write.
      dropId = true;
      game = await readGame(Game, game._id, game.householdId);
      continue;
    }
    if ((res?.matchedCount ?? res?.n ?? 0) > 0) return { written: true, autoTags: replace ? autoTags : null, keptUserSet: !replace };
    game = await readGame(Game, game._id, game.householdId);
  }
  deps.logger?.warn?.({ gameId: String(gameIn?._id) }, 'tags pass: gave up after repeated concurrent changes');
  return { written: false, autoTags: null };
}

/**
 * Run the tags pass for one game.
 * @param {{_id, householdId}} gameRef
 * @param {object} deps
 * @param {{cache?: object, prefetched?: object, force?: boolean}} [ctx] force = run even
 *   though tagsFetchedAt is set (an inline run right after a new match).
 * @returns {Promise<{outcome: 'tagged'|'untagged'|'skipped'|'nothing-to-ask'|'error'|'conflict', autoTags?: string[]}>}
 */
export async function tagGame(gameRef, deps, ctx = {}) {
  const tags = deps.providers?.tags;
  if (!tags) return { outcome: 'skipped' };
  const game = await readGame(deps.Game, gameRef._id, gameRef.householdId);
  if (!game || game.enrichment?.status !== 'matched') return { outcome: 'skipped' };
  if (game.enrichment?.tagsFetchedAt && !ctx.force) return { outcome: 'skipped' };

  let result;
  try {
    result = await collectTagTerms(game, tags, ctx);
  } catch (err) {
    deps.logger?.warn?.({ gameId: String(game._id), err: String(err?.message ?? err).slice(0, 200) }, 'tags pass: provider failed');
    return { outcome: 'error' };
  }
  // No source could be asked (none configured / none applies): leave it for later.
  if (!result.consulted) return { outcome: 'nothing-to-ask' };

  const written = await writeTags(game, result, deps);
  if (!written.written) return { outcome: 'conflict' };
  const count = written.autoTags ? written.autoTags.length : 0;
  return { outcome: count > 0 ? 'tagged' : 'untagged', autoTags: written.autoTags ?? undefined };
}

/**
 * The raw terms a matched provider detail already carries, so the inline
 * run right after a match needs no second call for that provider.
 */
export function prefetchedFromMatch(providerName, detail) {
  if (!detail || !Array.isArray(detail.tagTerms)) return {};
  if (providerName === 'igdb') return { igdb: { id: String(detail.providerId), terms: detail.tagTerms } };
  if (providerName === 'rawg') return { rawg: { id: String(detail.providerId), terms: detail.tagTerms } };
  return {};
}

/**
 * Batch prefetch for the worker: one batched IGDB call per 10 IGDB ids, one
 * per 10 Steam lookups, then the looked-up ids' tags. A prefetch failure is
 * logged and left empty — each game then asks on its own.
 */
export async function prefetchBatch(batch, tags, { logger } = {}) {
  const cache = { igdbTags: new Map(), igdbFetched: new Set(), steamToIgdb: new Map(), steamLooked: new Set() };
  if (!tags.igdbConfigured()) return cache;
  const steamUids = batch
    .filter((g) => !hasId(g.externalIds?.igdb) && isDigits(g.externalIds?.steamAppId))
    .map((g) => String(g.externalIds.steamAppId));
  try {
    if (steamUids.length) {
      const found = await tags.igdbIdsBySteam(steamUids);
      for (const uid of steamUids) cache.steamLooked.add(uid);
      for (const [uid, id] of found) cache.steamToIgdb.set(uid, String(id));
    }
  } catch (err) {
    logger?.warn?.({ err: String(err?.message ?? err).slice(0, 200) }, 'tags pass: steam lookup prefetch failed');
    cache.steamLooked.clear();
    cache.steamToIgdb.clear();
  }
  const ids = [
    ...batch.filter((g) => hasId(g.externalIds?.igdb)).map((g) => String(g.externalIds.igdb)),
    ...cache.steamToIgdb.values(),
  ].filter(isDigits);
  try {
    if (ids.length) {
      const got = await tags.igdbTagsByIds(ids);
      for (const id of ids) cache.igdbFetched.add(id);
      for (const [id, terms] of got) cache.igdbTags.set(id, terms);
    }
  } catch (err) {
    logger?.warn?.({ err: String(err?.message ?? err).slice(0, 200) }, 'tags pass: IGDB tags prefetch failed');
    cache.igdbFetched.clear();
    cache.igdbTags.clear();
  }
  return cache;
}

/**
 * Walk every selectable game (in `_id` order, batches of TAGS_BATCH_SIZE).
 * @returns {Promise<{processed, tagged, untagged, error, skipped}>}
 */
export async function runTagsPass(deps, { isDisabled } = {}) {
  const { Game, providers, logger } = deps;
  const tally = { processed: 0, tagged: 0, untagged: 0, error: 0, skipped: 0 };
  const tags = providers?.tags;
  if (!tags || (!tags.igdbConfigured() && !tags.rawgConfigured())) return tally;
  let lastId = null;
  for (;;) {
    const filter = tagsSelectionFilter();
    if (lastId) filter._id = { $gt: lastId };
    const batch = await Game.find(filter, { _id: 1, householdId: 1, externalIds: 1 }).sort({ _id: 1 }).limit(TAGS_BATCH_SIZE).lean();
    if (!batch.length) break;
    const cache = await prefetchBatch(batch, tags, { logger });
    for (const ref of batch) {
      lastId = ref._id;
      if (isDisabled?.()) return tally;
      try {
        const { outcome } = await tagGame(ref, deps, { cache });
        tally.processed += 1;
        if (outcome === 'tagged') tally.tagged += 1;
        else if (outcome === 'untagged') tally.untagged += 1;
        else if (outcome === 'error') tally.error += 1;
        else tally.skipped += 1;
      } catch (err) {
        tally.processed += 1;
        tally.error += 1;
        logger?.error?.({ gameId: String(ref._id), err: err?.message }, 'tags pass: game failed');
      }
    }
  }
  return tally;
}

export default { tagsSelectionFilter, canReplaceAutoTags, collectTagTerms, tagGame, prefetchedFromMatch, prefetchBatch, runTagsPass };
