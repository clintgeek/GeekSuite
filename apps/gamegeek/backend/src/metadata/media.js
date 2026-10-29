/**
 * Pure mappers for a game's store links and media (screenshots + trailers)
 * — apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Media and links. No network
 * here: mediaService.js fetches, these turn provider bodies into the one
 * shape the detail page draws. Tested offline against recorded fixtures.
 *
 * Every URL that leaves this file is https and on a host we expect for that
 * provider — a provider body is untrusted input, and the frontend renders
 * these straight into <img>, <video> and <a href>.
 */

/** The apicalypse `fields` for the media call: the page URL plus every image/video list. */
export const IGDB_MEDIA_FIELDS = ['url', 'screenshots.image_id', 'artworks.image_id', 'videos.video_id', 'videos.name'].join(',');

export const MAX_SCREENSHOTS = 20;
export const MAX_VIDEOS = 4;

const STEAM_HOST = /(^|\.)steamstatic\.com$|^steamcdn-a\.akamaihd\.net$/;
const IGDB_IMAGE_ID = /^[a-z0-9]{1,64}$/i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const RAWG_SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;

/** `url` if it parses, is https, and its host passes `hostOk`; otherwise null. */
export function safeUrl(url, hostOk) {
  if (typeof url !== 'string' || !url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!hostOk(parsed.hostname)) return null;
  return parsed.toString();
}

const steamUrl = (url) => safeUrl(url, (h) => STEAM_HOST.test(h));

export const igdbImageUrl = (imageId, size) => `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg`;

export const steamStoreUrl = (appId) => `https://store.steampowered.com/app/${appId}/`;

/**
 * The appdetails entry for `appId` — by key, or (Steam's quirk, recorded in
 * METADATA_ENRICHMENT.md) the one whose `data.steam_appid` matches.
 */
function steamEntry(appId, raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(appId);
  const direct = raw[id];
  if (direct?.success && direct.data) return direct.data;
  for (const entry of Object.values(raw)) {
    if (entry?.success && String(entry.data?.steam_appid) === id) return entry.data;
  }
  return null;
}

/**
 * Steam appdetails → `{ screenshots, videos }`.
 *
 * Steam `movies[]` (checked live 2026-10-29) carry `dash_av1`, `dash_h264`
 * and `hls_h264` — the older `mp4`/`webm` {480,max} objects are gone, but an
 * older cached body may still have them, so both are read. A movie with no
 * playable source is still a trailer: the frontend links it to the store.
 */
export function normalizeSteamMedia(appId, raw) {
  const data = steamEntry(appId, raw);
  if (!data) return { screenshots: [], videos: [] };

  const screenshots = [];
  for (const s of Array.isArray(data.screenshots) ? data.screenshots : []) {
    const full = steamUrl(s?.path_full);
    const thumb = steamUrl(s?.path_thumbnail) || full;
    if (!full) continue;
    screenshots.push({ thumb, full, source: 'steam' });
    if (screenshots.length >= MAX_SCREENSHOTS) break;
  }

  const movies = Array.isArray(data.movies) ? [...data.movies] : [];
  // Steam's "highlight" trailers lead; the order within each group is Steam's.
  movies.sort((a, b) => Number(Boolean(b?.highlight)) - Number(Boolean(a?.highlight)));
  const videos = [];
  for (const m of movies) {
    const thumb = steamUrl(m?.thumbnail);
    const hls = steamUrl(m?.hls_h264);
    const mp4 = steamUrl(m?.mp4?.max) || steamUrl(m?.mp4?.['480']);
    if (!thumb && !hls && !mp4) continue;
    videos.push({
      kind: 'steam',
      title: typeof m?.name === 'string' ? m.name.slice(0, 200) : 'Trailer',
      thumb,
      hls,
      mp4,
      // Where a browser that can't play HLS sends you instead.
      url: steamStoreUrl(String(appId)),
    });
    if (videos.length >= MAX_VIDEOS) break;
  }

  return { screenshots, videos };
}

/**
 * One IGDB `/games` row asked for with IGDB_MEDIA_FIELDS → `{ url,
 * screenshots, videos }`. Screenshots come first, artworks fill after them
 * (artworks are key art, not gameplay). Videos are YouTube ids.
 */
export function normalizeIgdbMedia(row) {
  if (!row || typeof row !== 'object') return { url: null, screenshots: [], videos: [] };

  const url = safeUrl(row.url, (h) => h === 'www.igdb.com' || h === 'igdb.com');

  const screenshots = [];
  const seen = new Set();
  for (const img of [...(Array.isArray(row.screenshots) ? row.screenshots : []), ...(Array.isArray(row.artworks) ? row.artworks : [])]) {
    const id = img?.image_id;
    if (typeof id !== 'string' || !IGDB_IMAGE_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    screenshots.push({ thumb: igdbImageUrl(id, 't_screenshot_med'), full: igdbImageUrl(id, 't_1080p'), source: 'igdb' });
    if (screenshots.length >= MAX_SCREENSHOTS) break;
  }

  const videos = [];
  for (const v of Array.isArray(row.videos) ? row.videos : []) {
    const id = v?.video_id;
    if (typeof id !== 'string' || !YOUTUBE_ID.test(id)) continue;
    videos.push({
      kind: 'youtube',
      title: typeof v?.name === 'string' && v.name ? v.name.slice(0, 200) : 'Trailer',
      youtubeId: id,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${id}`,
    });
    if (videos.length >= MAX_VIDEOS) break;
  }

  return { url, screenshots, videos };
}

/** RAWG `/games/{id}` body → its slug (the public page is rawg.io/games/<slug>), or null. */
export function rawgSlug(body) {
  const slug = body?.slug;
  return typeof slug === 'string' && RAWG_SLUG.test(slug) ? slug : null;
}

/**
 * The provider pages this game has ids for. Steam needs nothing fetched;
 * IGDB's web URL is a slug only its API knows, and RAWG's is the API's slug.
 */
export function buildMediaLinks(externalIds, { igdbUrl = null, rawgSlug: slug = null } = {}) {
  const ids = externalIds || {};
  const links = [];
  if (/^\d+$/.test(String(ids.steamAppId ?? ''))) links.push({ kind: 'steam', label: 'Steam store', url: steamStoreUrl(ids.steamAppId) });
  if (ids.igdb && igdbUrl) links.push({ kind: 'igdb', label: 'IGDB', url: igdbUrl });
  if (ids.rawg && slug) links.push({ kind: 'rawg', label: 'RAWG', url: `https://rawg.io/games/${slug}` });
  return links;
}

/**
 * Prefer Steam: when Steam has screenshots they're the set; IGDB fills only
 * when Steam has none. Trailers follow the same rule on their own, so a game
 * with Steam screenshots but no Steam movies still gets IGDB's videos.
 * `source` names who supplied the screenshots (or the videos, if no shots).
 */
export function mergeMedia({ steam, igdb } = {}) {
  const s = steam ?? { screenshots: [], videos: [] };
  const i = igdb ?? { screenshots: [], videos: [] };
  const screenshots = s.screenshots.length ? s.screenshots : i.screenshots;
  const videos = s.videos.length ? s.videos : i.videos;
  const source = screenshots.length ? screenshots[0].source : videos.length ? (videos[0].kind === 'steam' ? 'steam' : 'igdb') : null;
  return { screenshots, videos, source };
}

export default {
  IGDB_MEDIA_FIELDS,
  normalizeSteamMedia,
  normalizeIgdbMedia,
  rawgSlug,
  buildMediaLinks,
  mergeMedia,
  safeUrl,
};
