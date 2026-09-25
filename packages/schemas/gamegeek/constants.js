/**
 * gamegeek vocabulary shared by every writer (basegeek gateway, gamegeek backend)
 * and safe to import from the frontend's validation copy.
 *
 * DOCS/GameGeekPlan.md §3 is the design record. Add a value here, never inline.
 */

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
  'paste-list',
  'sample',
]);

const HOURS_SOURCES = Object.freeze(['manual', 'steam']);

const COMPLETION_LEVELS = Object.freeze(['story', 'extra', 'complete']);

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
  MAX_SESSIONS,
  bounds,
};
