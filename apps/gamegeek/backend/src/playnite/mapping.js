/**
 * Playnite export entry → GameGeek shapes. The tables here are the ones in
 * apps/gamegeek/DOCS/PLAYNITE_IMPORT.md §Mapping; change them there first.
 *
 * Pure: no database, no clock.
 */
import gameSchemaModule from '@geeksuite/schemas/gamegeek/game';
import constantsModule from '@geeksuite/schemas/gamegeek/constants';

const { computeSortTitle } = gameSchemaModule;
const { bounds, canonicalGenres } = constantsModule;

export const LIST_CAP = bounds.listMax.max; // 50
const TAG_MAX = bounds.tag.maxlength; // 60
const TITLE_MAX = bounds.title.maxlength; // 300

/** Playnite `sourceName` (lowercased) → copy storefront. Anything else → 'other'. */
export const STOREFRONT_BY_SOURCE = Object.freeze({
  epic: 'epic',
  gog: 'gog',
  amazon: 'amazon',
  xbox: 'xbox',
  'xbox game pass': 'xbox',
  'ubisoft connect': 'ubisoft',
  steam: 'steam',
  'battle.net': 'battle-net',
  'ea app': 'ea',
  origin: 'ea',
  'itch.io': 'itch',
});

/** Sources whose copies are a subscription, not an owned digital copy. */
const SUBSCRIPTION_SOURCES = new Set(['xbox game pass']);
/** Sources whose copy platform can be an Xbox console instead of pc. */
const XBOX_SOURCES = new Set(['xbox', 'xbox game pass']);

/** Playnite platform name → GameGeek platform. Unknown names are dropped. */
export const PLATFORM_BY_NAME = Object.freeze({
  'PC (Windows)': 'pc',
  'PC (Linux)': 'linux',
  Macintosh: 'mac',
  'Microsoft Xbox Series': 'xbox-series',
  'Microsoft Xbox One': 'xbox-one',
  'Microsoft Xbox 360': 'xbox-360',
  'Sony PlayStation 5': 'ps5',
  'Sony PlayStation 4': 'ps4',
  'Nintendo Switch': 'switch',
});

/** Preference order when an Xbox source lists more than one Xbox platform. */
const XBOX_PLATFORM_ORDER = ['xbox-series', 'xbox-one', 'xbox-360'];

/**
 * The matching key: lowercase, drop ™®©, `&` → `and`, keep only letters and
 * digits. "Director's Cut" stays distinct from the base game because the
 * words survive. A title that normalizes to nothing (all symbols) falls back
 * to its trimmed lowercase form so such titles don't all collide on ''.
 */
export function normalizeTitle(title) {
  // Drop ™®© BEFORE NFKC, which would otherwise expand ™ into the letters "TM".
  const raw = String(title ?? '').replace(/[™®©]/g, '').normalize('NFKC').toLowerCase();
  const key = raw
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return key || raw.trim();
}

/** `Y-M-D`, unpadded allowed → Date at UTC midnight; anything unparseable → null. */
export function parseReleaseDate(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Reject roll-overs such as 2022-2-31 → March 3.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** An ISO instant → Date, or null. */
export function parseInstant(value) {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Case-insensitive dedupe, trimmed, length-bounded, capped. */
export function cleanList(values, { cap = LIST_CAP, maxLength = TAG_MAX } = {}) {
  const seen = new Set();
  const out = [];
  for (const v of values ?? []) {
    if (typeof v !== 'string') continue;
    const s = v.trim().slice(0, maxLength);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

export function storefrontFor(sourceName) {
  const key = typeof sourceName === 'string' ? sourceName.trim().toLowerCase() : '';
  return STOREFRONT_BY_SOURCE[key] ?? 'other';
}

export function formatFor(sourceName) {
  const key = typeof sourceName === 'string' ? sourceName.trim().toLowerCase() : '';
  return SUBSCRIPTION_SOURCES.has(key) ? 'subscription' : 'digital';
}

export function mapPlatforms(names) {
  const out = [];
  for (const n of names ?? []) {
    const p = PLATFORM_BY_NAME[typeof n === 'string' ? n.trim() : ''];
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/** The copy's own platform: an Xbox console for an Xbox/Game Pass source that lists one, else pc. */
export function copyPlatformFor(sourceName, platforms) {
  const key = typeof sourceName === 'string' ? sourceName.trim().toLowerCase() : '';
  if (XBOX_SOURCES.has(key)) {
    const hit = XBOX_PLATFORM_ORDER.find((p) => platforms.includes(p));
    if (hit) return hit;
  }
  return 'pc';
}

/**
 * One validated export entry (see parse.js) → everything the planner needs.
 * `installDirectory` is never read: the parser has already stripped it.
 */
export function mapEntry(entry) {
  const title = String(entry.name).trim().slice(0, TITLE_MAX);
  const platforms = mapPlatforms(entry.platforms);
  const sortingName = typeof entry.sortingName === 'string' ? entry.sortingName.trim() : '';
  const steamAppId =
    entry.steamAppIdConfidence === 'exact' && entry.steamAppId != null && String(entry.steamAppId).trim()
      ? String(entry.steamAppId).trim()
      : null;
  const sourceName = typeof entry.sourceName === 'string' && entry.sourceName.trim() ? entry.sourceName.trim() : null;

  return {
    playniteId: entry.playniteId,
    title,
    normalizedTitle: normalizeTitle(title),
    sortTitle: sortingName ? sortingName.toLowerCase() : computeSortTitle(title),
    storefront: storefrontFor(sourceName),
    format: formatFor(sourceName),
    copyPlatform: copyPlatformFor(sourceName, platforms),
    platforms,
    // Canonical names (TAGS_AND_FILTERS.md §A5): "Role-playing (RPG)" → "RPG".
    genres: canonicalGenres(cleanList(entry.genres)),
    tags: cleanList([...(entry.categories ?? []), ...(entry.tags ?? [])]),
    releaseDate: parseReleaseDate(entry.releaseDate),
    steamAppId,
    favorite: entry.favorite === true,
    hidden: entry.hidden === true,
    playnite: {
      playniteId: entry.playniteId,
      providerGameId: entry.providerGameId == null ? null : String(entry.providerGameId),
      sourceName,
      playtimeSeconds: Math.max(0, Math.round(Number(entry.playtimeSeconds) || 0)),
      lastActivity: parseInstant(entry.lastActivity),
      hidden: entry.hidden === true,
    },
  };
}

export default { normalizeTitle, mapEntry, parseReleaseDate, storefrontFor, formatFor, mapPlatforms, copyPlatformFor };
