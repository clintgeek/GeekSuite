/**
 * Pure normalizers for the (keyless) Steam Store search and appdetails
 * endpoints → MetadataCandidate (DOCS/GameGeekPlan.md §4.2). No network
 * here — see steamClient.js. Tested against recorded fixture JSON under
 * test/fixtures/, never live.
 */
import { mapNames, STEAM_MODE_MAP } from './platformMap.js';
import { toPlainText } from '../enrichment/text.js';

/** `library_600x900` is the portrait asset the plan calls for. */
export function steamLibraryCoverUrl(appId) {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
}

/**
 * One `storesearch` result item → MetadataCandidate. Search results are
 * cheap and thin: title, appid, a guessed portrait cover, platforms=['pc'].
 * A full candidate (developers, genres, real release date) is one
 * `GET /api/metadata/steam/:appId` away — the plan explicitly skips
 * appdetails-per-result here because it's too slow for a search box.
 */
export function normalizeSteamSearchItem(item) {
  const appId = String(item.id);
  return {
    provider: 'steam-store',
    providerId: appId,
    title: item.name || '',
    releaseDate: null,
    developers: [],
    publishers: [],
    genres: [],
    description: '',
    // storesearch items carry {windows, mac, linux}; older shapes don't — assume pc.
    platforms: item.platforms ? steamPlatformList(item.platforms) : ['pc'],
    modes: [],
    coverUrl: steamLibraryCoverUrl(appId),
    externalIds: { steamAppId: appId },
  };
}

/** @param {{ items?: object[] }} response the storesearch JSON body. */
export function normalizeSteamSearchResults(response) {
  const items = Array.isArray(response?.items) ? response.items : [];
  return items.map(normalizeSteamSearchItem);
}

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function monthIndex(name) {
  const key = String(name || '').slice(0, 3).toLowerCase();
  return key in MONTHS ? MONTHS[key] : null;
}

/**
 * Steam's `release_date.date` is free-text English, not a machine format:
 * "21 Aug, 2020", "Aug 21, 2020", "Aug 2020", "2020", or "Coming soon" (no
 * date at all). Parsed by hand rather than `Date.parse`, because a
 * timezone-less string like this is ambiguous under `Date.parse` (ISO forms
 * are read as UTC, everything else as local) and this app's date rule is
 * "calendar date → UTC midnight", not "whatever the host's TZ makes it".
 * Returns null rather than guessing when the string doesn't match a known
 * shape — "Coming soon" included.
 *
 * @param {string} dateStr
 * @returns {string|null} ISO UTC-midnight date, or null.
 */
export function parseSteamReleaseDate(dateStr) {
  const s = String(dateStr || '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = monthIndex(m[2]);
    const year = Number(m[3]);
    if (month !== null) return new Date(Date.UTC(year, month, day)).toISOString();
  }

  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const month = monthIndex(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (month !== null) return new Date(Date.UTC(year, month, day)).toISOString();
  }

  m = s.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (m) {
    const month = monthIndex(m[1]);
    const year = Number(m[2]);
    if (month !== null) return new Date(Date.UTC(year, month, 1)).toISOString();
  }

  m = s.match(/^(\d{4})$/);
  if (m) return new Date(Date.UTC(Number(m[1]), 0, 1)).toISOString();

  return null;
}

function steamPlatformList(platforms) {
  const out = [];
  if (platforms?.windows) out.push('pc');
  if (platforms?.mac) out.push('mac');
  if (platforms?.linux) out.push('linux');
  return out;
}

/**
 * @param {string} appId
 * @param {object} response the raw `appdetails?appids=<id>` JSON body,
 *   keyed by appid: `{ "<id>": { success, data } }`.
 * @returns {object|null} MetadataCandidate, or null when Steam reports
 *   `success: false` (delisted/invalid app id) or the shape is unexpected.
 */
/**
 * The appdetails entry for `appId`. Steam usually keys the body by the
 * requested id, but not always: asking for 620 (Portal 2) has been answered
 * as `{"323180": {success, data: {steam_appid: 620, ...}}}` (recorded
 * 2026-09-25, test/fixtures/steam-appdetails-portal2.json). So fall back to
 * the entry whose `data.steam_appid` is the one asked for.
 */
function findAppEntry(appId, response) {
  if (!response || typeof response !== 'object') return null;
  const id = String(appId);
  if (response[id]) return response[id];
  return Object.values(response).find((e) => e?.data && String(e.data.steam_appid) === id) ?? null;
}

export function normalizeSteamAppDetails(appId, response) {
  const entry = findAppEntry(appId, response);
  if (!entry?.success || !entry?.data) return null;
  const data = entry.data;

  const genres = Array.isArray(data.genres) ? data.genres.map((g) => g?.description).filter(Boolean) : [];
  const categoryNames = Array.isArray(data.categories) ? data.categories.map((c) => c?.description).filter(Boolean) : [];

  return {
    provider: 'steam-store',
    providerId: String(appId),
    title: data.name || '',
    releaseDate: data.release_date?.coming_soon ? null : parseSteamReleaseDate(data.release_date?.date),
    developers: Array.isArray(data.developers) ? data.developers : [],
    publishers: Array.isArray(data.publishers) ? data.publishers : [],
    genres,
    // short_description holds HTML tags and entities (&quot;…&quot;).
    description: toPlainText(data.short_description || ''),
    platforms: steamPlatformList(data.platforms),
    modes: mapNames(categoryNames, STEAM_MODE_MAP),
    coverUrl: data.header_image || steamLibraryCoverUrl(appId),
    // Enrichment's download order: the 600x900 portrait first, then the
    // landscape header (newer apps often 404 the legacy portrait path).
    coverUrls: [steamLibraryCoverUrl(appId), data.header_image].filter(Boolean),
    externalIds: { steamAppId: String(appId) },
  };
}

export default {
  steamLibraryCoverUrl,
  normalizeSteamSearchItem,
  normalizeSteamSearchResults,
  parseSteamReleaseDate,
  normalizeSteamAppDetails,
};
