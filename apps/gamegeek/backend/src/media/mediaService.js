/**
 * A game's media and store links for the detail page
 * (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Media and links).
 *
 *   - Steam appdetails (keyless) when the game has a steamAppId;
 *   - IGDB (keyed) when it has an IGDB id — for its page URL, and for
 *     screenshots/trailers when Steam has none;
 *   - RAWG (keyed) when it has a RAWG id — only for the page slug.
 *
 * Every provider call runs in parallel under its own deadline, so one slow
 * provider gives a partial answer instead of a slow page. Results are cached
 * by provider ids: a full answer for MEDIA_TTL_MS, an answer with any
 * failure for FAILURE_TTL_MS, so a provider blip retries soon but a dead one
 * isn't hammered. Concurrent requests for the same ids share one fetch.
 *
 * Everything is injectable (store, fetchers, clock) so the tests never touch
 * Mongo or the network.
 */
import GameMediaCache from '../models/GameMediaCache.js';
import logger from '../lib/logger.js';
import { fetchSteamAppDetails } from '../metadata/steamClient.js';
import { fetchIgdbMedia, isIgdbConfigured } from '../metadata/igdbClient.js';
import { fetchRawgGame, isRawgConfigured } from '../metadata/rawgClient.js';
import { normalizeSteamMedia, normalizeIgdbMedia, rawgSlug, buildMediaLinks, mergeMedia } from '../metadata/media.js';
import { getSteamPacer, STEAM_BACKOFF_MS } from '../enrichment/pacing.js';

export const MEDIA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const FAILURE_TTL_MS = 15 * 60 * 1000;
export const PROVIDER_DEADLINE_MS = 6000;

const digits = (v) => (/^\d{1,12}$/.test(String(v ?? '')) ? String(v) : null);

/** The provider ids this service uses, validated (digits only), or null each. */
export function mediaIds(externalIds) {
  const ids = externalIds || {};
  return { steamAppId: digits(ids.steamAppId), igdb: digits(ids.igdb), rawg: digits(ids.rawg) };
}

/** The cache key for a set of ids, or null when the game has none to look up. */
export function mediaKey(ids) {
  if (!ids.steamAppId && !ids.igdb && !ids.rawg) return null;
  return `steam:${ids.steamAppId ?? ''}|igdb:${ids.igdb ?? ''}|rawg:${ids.rawg ?? ''}`;
}

/** Rejects with `code: 'DEADLINE'` if `promise` hasn't settled within `ms`. */
export function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`provider took longer than ${ms} ms`);
      err.code = 'DEADLINE';
      reject(err);
    }, ms);
    timer.unref?.();
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/** The real fetchers: each returns a normalized piece, or throws. */
export function createMediaFetchers({ fetchImpl = fetch, env = process.env, steamPacer = getSteamPacer() } = {}) {
  return {
    igdbConfigured: () => isIgdbConfigured(env),
    rawgConfigured: () => isRawgConfigured(env),
    async steam(appId) {
      // The same pacer the enrichment worker uses, so a detail page and the
      // worker together still stay under Steam's tolerance. No retry here (a
      // person is waiting), but a 429 still pauses the shared pacer.
      try {
        const raw = await steamPacer.schedule(() => fetchSteamAppDetails(appId, { fetchImpl }));
        return normalizeSteamMedia(appId, raw);
      } catch (err) {
        if (err?.status === 429) steamPacer.pause(STEAM_BACKOFF_MS);
        throw err;
      }
    },
    async igdb(id) {
      return normalizeIgdbMedia(await fetchIgdbMedia(id, { fetchImpl, env }));
    },
    async rawg(id) {
      return rawgSlug(await fetchRawgGame(id, { fetchImpl, env }));
    },
  };
}

/** A Mongo-backed store: `get(key)` → `{payload, fetchedAt, expiresAt}` or null; `set(key, entry)`. */
export function createMongoMediaStore(Model = GameMediaCache) {
  return {
    async get(key) {
      return Model.findById(key).lean();
    },
    async set(key, entry) {
      await Model.updateOne({ _id: key }, { $set: entry }, { upsert: true });
    },
  };
}

function shape(game, ids, cached) {
  const p = cached?.payload ?? {};
  return {
    links: buildMediaLinks(ids, { igdbUrl: p.igdbUrl ?? null, rawgSlug: p.rawgSlug ?? null }),
    screenshots: Array.isArray(p.screenshots) ? p.screenshots : [],
    videos: Array.isArray(p.videos) ? p.videos : [],
    source: p.source ?? null,
    fetchedAt: cached?.fetchedAt ? new Date(cached.fetchedAt).toISOString() : null,
    partial: Array.isArray(p.errors) && p.errors.length > 0,
    errors: Array.isArray(p.errors) ? p.errors : [],
  };
}

export function createMediaService({
  store = createMongoMediaStore(),
  fetchers = createMediaFetchers(),
  now = Date.now,
  deadlineMs = PROVIDER_DEADLINE_MS,
  log = logger,
} = {}) {
  const inflight = new Map();

  async function fetchFresh(ids) {
    const tasks = {};
    if (ids.steamAppId) tasks.steam = fetchers.steam(ids.steamAppId);
    if (ids.igdb && fetchers.igdbConfigured()) tasks.igdb = fetchers.igdb(ids.igdb);
    if (ids.rawg && fetchers.rawgConfigured()) tasks.rawg = fetchers.rawg(ids.rawg);

    const names = Object.keys(tasks);
    const settled = await Promise.allSettled(names.map((n) => withDeadline(Promise.resolve(tasks[n]), deadlineMs)));
    const results = {};
    const errors = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') results[names[i]] = r.value;
      else {
        errors.push(names[i]);
        log?.warn?.({ provider: names[i], err: r.reason?.message, code: r.reason?.code }, 'media: provider failed');
      }
    });

    const merged = mergeMedia({ steam: results.steam, igdb: results.igdb });
    return {
      screenshots: merged.screenshots,
      videos: merged.videos,
      source: merged.source,
      igdbUrl: results.igdb?.url ?? null,
      rawgSlug: results.rawg ?? null,
      errors,
    };
  }

  /**
   * `game` is a lean Game already scoped to the caller's household — the
   * route does that lookup; this never reads Game itself.
   */
  async function getMedia(game) {
    const ids = mediaIds(game?.externalIds);
    const key = mediaKey(ids);
    if (!key) return shape(game, ids, null);

    let cached = null;
    try {
      cached = await store.get(key);
    } catch (err) {
      log?.warn?.({ err: err?.message }, 'media: cache read failed');
    }
    if (cached && new Date(cached.expiresAt).getTime() > now()) return shape(game, ids, cached);

    if (!inflight.has(key)) {
      const job = (async () => {
        const payload = await fetchFresh(ids);
        const fetchedAt = new Date(now());
        const ttl = payload.errors.length ? FAILURE_TTL_MS : MEDIA_TTL_MS;
        const entry = { payload, fetchedAt, expiresAt: new Date(now() + ttl) };
        try {
          await store.set(key, entry);
        } catch (err) {
          log?.warn?.({ err: err?.message }, 'media: cache write failed');
        }
        return entry;
      })().finally(() => inflight.delete(key));
      inflight.set(key, job);
    }
    return shape(game, ids, await inflight.get(key));
  }

  return { getMedia };
}

let service = null;

/** The process-wide service the route uses. */
export function getMediaService() {
  if (!service) service = createMediaService();
  return service;
}

/** Tests: swap the service the route uses (null restores the real one lazily). */
export function setMediaService(next) {
  service = next;
}

export default { createMediaService, getMediaService, setMediaService, mediaKey, mediaIds, withDeadline };
