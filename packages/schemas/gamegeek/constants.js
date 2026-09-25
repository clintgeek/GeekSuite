/**
 * gamegeek vocabulary shared by every writer (basegeek gateway, gamegeek backend)
 * and safe to import from the frontend's validation copy.
 *
 * DOCS/GameGeekPlan.md §3 is the design record. Add a value here, never inline.
 */
const tags = require('./tags.js');

/** Built-in shelves. Custom shelves are `custom-<slug>` and live on the profile. */
const BUILT_IN_SHELVES = Object.freeze([
  'backlog',
  'playing',
  'finished',
  'on-hold',
  'abandoned',
  'wishlist',
]);

/**
 * Platforms a copy can be on. Free strings are rejected so filters and
 * platform chips stay a closed set; add here when a real copy needs one.
 */
const PLATFORMS = Object.freeze([
  'pc',
  'steam-deck',
  'mac',
  'linux',
  'switch',
  'switch-2',
  'ps5',
  'ps4',
  'ps3',
  'xbox-series',
  'xbox-one',
  'xbox-360',
  'ios',
  'android',
  'cloud',
  'arcade',
  'nes',
  'snes',
  'n64',
  'gamecube',
  'wii',
  'wii-u',
  'game-boy',
  'gba',
  'ds',
  '3ds',
  'genesis',
  'ps1',
  'ps2',
  'psp',
  'vita',
  'atari-2600',
  'retro-other',
]);

/** Where a digital copy lives (or the store a physical one came from). */
const STOREFRONTS = Object.freeze([
  'steam',
  'gog',
  'epic',
  'amazon',
  'luna',
  'itch',
  'ea',
  'ubisoft',
  'battle-net',
  'xbox',
  'microsoft',
  'playstation',
  'nintendo',
  'apple',
  'google-play',
  'retail',
  'other',
]);

const COPY_FORMATS = Object.freeze(['physical', 'digital', 'subscription']);

const GAME_MODES = Object.freeze([
  'single',
  'coop-local',
  'coop-online',
  'pvp-local',
  'pvp-online',
]);

const GAME_SOURCES = Object.freeze([
  'manual',
  'igdb',
  'steam-store',
  'steam-import',
  'csv-import',
  'playnite-import',
  'sample',
]);

// 'playnite' hours are the sum of a game's Playnite copies' playtime.
const HOURS_SOURCES = Object.freeze(['manual', 'steam', 'playnite']);

const COMPLETION_LEVELS = Object.freeze(['story', 'extra', 'complete']);

/** Metadata enrichment — apps/gamegeek/DOCS/METADATA_ENRICHMENT.md. */
const ENRICHMENT_STATUSES = Object.freeze(['pending', 'matched', 'no-match', 'ambiguous', 'error', 'unlinked']);
const ENRICHMENT_PROVIDERS = Object.freeze(['steam', 'igdb', 'rawg']);

/**
 * Genre names as providers and Playnite spell them → the one name GameGeek
 * shows (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §A5). Looked up
 * case-insensitively; a name not listed here is kept as it is.
 */
const GENRE_CANONICAL = Object.freeze({
  'Role-playing (RPG)': 'RPG',
  RPG: 'RPG',
  'Turn-based strategy (TBS)': 'Turn-based Strategy',
  'Real Time Strategy (RTS)': 'Real-time Strategy',
  "Hack and slash/Beat 'em up": 'Hack & Slash',
  Platform: 'Platformer',
  Platformer: 'Platformer',
  Simulator: 'Simulation',
  Simulation: 'Simulation',
  'Card & Board Game': 'Card & Board',
  'Board Games': 'Card & Board',
  Sport: 'Sports',
  Sports: 'Sports',
  'Point-and-click': 'Point & Click',
  'Massively Multiplayer': 'MMO',
});

const GENRE_LOOKUP = Object.freeze(
  Object.fromEntries(Object.entries(GENRE_CANONICAL).map(([k, v]) => [k.trim().toLowerCase(), v]))
);

/**
 * Canonical genre list: each name mapped through GENRE_CANONICAL (unknown
 * names kept, trimmed), then deduped case-insensitively in first-seen order.
 * Non-strings and blanks are dropped.
 */
function canonicalGenres(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const name = GENRE_LOOKUP[trimmed.toLowerCase()] ?? trimmed;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** GameFilterInput vocabularies (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §B1). */
const FILTER_PLAYED = Object.freeze(['never', 'played', 'recent']);
/** "recent" = the caller's lastPlayedAt within this many days. */
const RECENT_PLAYED_DAYS = 30;
/** Time-to-beat (main) buckets, in hours: short <5, medium 5–15, long 15–40, epic 40+. */
const LENGTH_BUCKETS = Object.freeze(['short', 'medium', 'long', 'epic', 'unknown']);
const LENGTH_BOUNDS = Object.freeze({ short: 5, medium: 15, long: 40 });
const TAG_MATCH_MODES = Object.freeze(['any', 'all']);

/** Sessions kept per GamePlayer row; older ones are already counted in hoursPlayed. */
const MAX_SESSIONS = 200;

const bounds = Object.freeze({
  title: Object.freeze({ maxlength: 300 }),
  description: Object.freeze({ maxlength: 5000 }),
  notes: Object.freeze({ maxlength: 5000 }),
  review: Object.freeze({ maxlength: 5000 }),
  tag: Object.freeze({ maxlength: 60 }),
  listMax: Object.freeze({ max: 50 }),
  rating: Object.freeze({ min: 0, max: 5 }),
  progress: Object.freeze({ min: 0, max: 100 }),
  hours: Object.freeze({ min: 0, max: 100000 }),
  sessionMinutes: Object.freeze({ min: 1, max: 24 * 60 }),
});

module.exports = {
  BUILT_IN_SHELVES,
  PLATFORMS,
  STOREFRONTS,
  COPY_FORMATS,
  GAME_MODES,
  GAME_SOURCES,
  HOURS_SOURCES,
  COMPLETION_LEVELS,
  ENRICHMENT_STATUSES,
  ENRICHMENT_PROVIDERS,
  MAX_SESSIONS,
  GENRE_CANONICAL,
  canonicalGenres,
  FILTER_PLAYED,
  RECENT_PLAYED_DAYS,
  LENGTH_BUCKETS,
  LENGTH_BOUNDS,
  TAG_MATCH_MODES,
  // The tag vocabulary lives in tags.js; re-exported so every consumer can
  // reach it through the package's existing `gamegeek/constants` export.
  TAG_GROUPS: tags.TAG_GROUPS,
  ALL_TAGS: tags.ALL_TAGS,
  TAG_SYNONYMS: tags.TAG_SYNONYMS,
  MAX_AUTO_TAGS: tags.MAX_AUTO_TAGS,
  normalizeTagTerm: tags.normalizeTagTerm,
  canonicalTag: tags.canonicalTag,
  mapProviderTags: tags.mapProviderTags,
  bounds,
};
