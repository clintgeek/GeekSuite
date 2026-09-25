/**
 * The enrichment providers, in the spec's order
 * (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Providers, in order per game):
 *
 *   1. steam-appdetails — the game already has externalIds.steamAppId (exact id, no title match)
 *   2. igdb             — when IGDB_CLIENT_ID + IGDB_CLIENT_SECRET are set
 *   3. rawg             — when RAWG_API_KEY is set
 *   4. steam-search     — always (keyless), store search → strict match → appdetails
 *
 * Every provider exposes the same small interface, so enrichGame() and the
 * tests can run the order against fakes:
 *   { step, name, isConfigured(), appliesTo(game), idFor?(game), search?(title), detail(id) }
 * `name` is what the Game.enrichment record calls it ('steam' | 'igdb' | 'rawg').
 * Candidates come back with `provider` set to that name.
 */
import { searchSteamStore, fetchSteamAppDetails } from '../metadata/steamClient.js';
import { normalizeSteamSearchResults, normalizeSteamAppDetails } from '../metadata/steam.js';
import {
  isIgdbConfigured,
  searchIgdbGames,
  fetchIgdbGame,
  fetchIgdbTimeToBeat,
  fetchIgdbTagsById,
  fetchIgdbExternalGamesBySteam,
  IGDB_BATCH_MAX,
} from '../metadata/igdbClient.js';
import {
  normalizeIgdbSearchResults,
  normalizeIgdbDetail,
  normalizeIgdbTagRows,
  normalizeIgdbSteamLookup,
} from '../metadata/igdb.js';
import { isRawgConfigured, searchRawgGames, fetchRawgGame } from '../metadata/rawgClient.js';
import { normalizeRawgSearchResults, normalizeRawgGame, rawgTagTerms } from '../metadata/rawg.js';
import { getSteamPacer, pacedWithBackoff } from './pacing.js';

const SEARCH_LIMIT = 10;

const asProvider = (name) => (c) => (c ? { ...c, provider: name } : c);

export function createProviders({ fetchImpl = fetch, env = process.env, steamPacer = getSteamPacer(), logger } = {}) {
  const steam = (fn) => pacedWithBackoff(steamPacer, fn, { logger });

  async function steamDetail(appId) {
    const raw = await steam(() => fetchSteamAppDetails(appId, { fetchImpl }));
    return asProvider('steam')(normalizeSteamAppDetails(appId, raw));
  }
  async function steamSearch(title) {
    const raw = await steam(() => searchSteamStore(title, { fetchImpl }));
    return normalizeSteamSearchResults(raw).map(asProvider('steam'));
  }

  const steamAppDetails = {
    step: 'steam-appdetails',
    name: 'steam',
    isConfigured: () => true,
    appliesTo: (game) => /^\d+$/.test(String(game?.externalIds?.steamAppId ?? '')),
    idFor: (game) => String(game.externalIds.steamAppId),
    detail: steamDetail,
  };

  const igdb = {
    step: 'igdb',
    name: 'igdb',
    isConfigured: () => isIgdbConfigured(env),
    appliesTo: () => true,
    async search(title) {
      return normalizeIgdbSearchResults(await searchIgdbGames(title, SEARCH_LIMIT, { fetchImpl, env }));
    },
    async detail(id) {
      const game = await fetchIgdbGame(id, { fetchImpl, env });
      if (!game) return null;
      let ttb = [];
      try {
        ttb = await fetchIgdbTimeToBeat(id, { fetchImpl, env });
      } catch (err) {
        // Time-to-beat is a nice-to-have; the rest of the match still lands.
        logger?.warn?.({ err: err?.message }, 'enrichment: IGDB time-to-beat failed');
      }
      return normalizeIgdbDetail(game, ttb);
    },
  };

  const rawg = {
    step: 'rawg',
    name: 'rawg',
    isConfigured: () => isRawgConfigured(env),
    appliesTo: () => true,
    async search(title) {
      return normalizeRawgSearchResults(await searchRawgGames(title, { pageSize: SEARCH_LIMIT, fetchImpl, env }));
    },
    async detail(id) {
      const body = await fetchRawgGame(id, { fetchImpl, env });
      return body ? normalizeRawgGame(body) : null;
    },
  };

  const steamStoreSearch = {
    step: 'steam-search',
    name: 'steam',
    isConfigured: () => true,
    appliesTo: () => true,
    search: steamSearch,
    detail: steamDetail,
  };

  const chunk = (list, n) => {
    const out = [];
    for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
    return out;
  };

  /**
   * The tags pass's sources (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §A4).
   * IGDB calls batch IGDB_BATCH_MAX ids per request behind the IGDB limiter;
   * RAWG is one detail call per game behind the RAWG limiter.
   */
  const tags = {
    igdbConfigured: () => igdb.isConfigured(),
    rawgConfigured: () => rawg.isConfigured(),
    /** @returns {Promise<Map<string, string[]>>} igdb id → raw terms (ids IGDB doesn't know are absent). */
    async igdbTagsByIds(ids) {
      const out = new Map();
      for (const part of chunk([...new Set(ids.map(String))], IGDB_BATCH_MAX)) {
        for (const [id, terms] of normalizeIgdbTagRows(await fetchIgdbTagsById(part, { fetchImpl, env }))) out.set(id, terms);
      }
      return out;
    },
    /** @returns {Promise<Map<string, string>>} steam app id → igdb id (unambiguous hits only). */
    async igdbIdsBySteam(uids) {
      const out = new Map();
      for (const part of chunk([...new Set(uids.map(String))], IGDB_BATCH_MAX)) {
        for (const [uid, id] of normalizeIgdbSteamLookup(await fetchIgdbExternalGamesBySteam(part, { fetchImpl, env }))) out.set(uid, id);
      }
      return out;
    },
    /** @returns {Promise<string[]|null>} English RAWG tag terms, or null when RAWG doesn't know the id. */
    async rawgTags(id) {
      const body = await fetchRawgGame(id, { fetchImpl, env });
      return body ? rawgTagTerms(body.tags) : null;
    },
    /** Strict-matchable IGDB title search (same candidates the enrichment matcher sees). */
    igdbSearch: (title) => igdb.search(title),
  };

  const ordered = [steamAppDetails, igdb, rawg, steamStoreSearch];
  return {
    /** The enrichment order. */
    ordered,
    /** Title-search providers for the candidate picker (every configured one). */
    searchable: [igdb, rawg, steamStoreSearch],
    /** Detail fetch by the record's provider name, for apply. */
    byName: { steam: steamStoreSearch, igdb, rawg },
    configured: () => ({ steam: true, igdb: igdb.isConfigured(), rawg: rawg.isConfigured() }),
    /** Tag sources for the tags pass. */
    tags,
  };
}

export default { createProviders };
