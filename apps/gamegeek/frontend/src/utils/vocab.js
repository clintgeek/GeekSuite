/**
 * Human labels for GameGeek's closed vocabulary.
 *
 * The ids are owned by packages/schemas/gamegeek/constants.js (the server
 * validates against it); the `gameVocabulary` query hands the live list to the
 * UI. This file only owns how an id READS. An id the server knows and this
 * file does not still renders — `humanize` turns `switch-2` into "Switch 2" —
 * so a new platform added server-side never shows up as a raw slug.
 */

export const BUILT_IN_SHELVES = ['playing', 'backlog', 'finished', 'on-hold', 'abandoned', 'wishlist'];

/** Fallback lists, used until gameVocabulary answers (and in tests). */
export const DEFAULT_VOCAB = {
  shelves: ['backlog', 'playing', 'finished', 'on-hold', 'abandoned', 'wishlist'],
  platforms: [
    'pc', 'steam-deck', 'mac', 'linux', 'switch', 'switch-2', 'ps5', 'ps4', 'ps3',
    'xbox-series', 'xbox-one', 'xbox-360', 'ios', 'android', 'cloud', 'arcade',
    'nes', 'snes', 'n64', 'gamecube', 'wii', 'wii-u', 'game-boy', 'gba', 'ds', '3ds',
    'genesis', 'ps1', 'ps2', 'psp', 'vita', 'atari-2600', 'retro-other',
  ],
  storefronts: [
    'steam', 'gog', 'epic', 'amazon', 'luna', 'itch', 'ea', 'ubisoft', 'battle-net',
    'xbox', 'microsoft', 'playstation', 'nintendo', 'apple', 'google-play', 'retail', 'other',
  ],
  copyFormats: ['physical', 'digital', 'subscription'],
  modes: ['single', 'coop-local', 'coop-online', 'pvp-local', 'pvp-online'],
  completionLevels: ['story', 'extra', 'complete'],
};

const SHELF_LABELS = {
  all: 'All',
  playing: 'Playing',
  backlog: 'Backlog',
  finished: 'Finished',
  'on-hold': 'On hold',
  abandoned: 'Abandoned',
  wishlist: 'Wishlist',
  unshelved: 'Unshelved',
};

/** Full names — detail, selects, settings. */
const PLATFORM_LABELS = {
  pc: 'PC',
  'steam-deck': 'Steam Deck',
  mac: 'Mac',
  linux: 'Linux',
  switch: 'Switch',
  'switch-2': 'Switch 2',
  ps5: 'PlayStation 5',
  ps4: 'PlayStation 4',
  ps3: 'PlayStation 3',
  'xbox-series': 'Xbox Series X|S',
  'xbox-one': 'Xbox One',
  'xbox-360': 'Xbox 360',
  ios: 'iPhone & iPad',
  android: 'Android',
  cloud: 'Cloud',
  arcade: 'Arcade',
  nes: 'NES',
  snes: 'SNES',
  n64: 'Nintendo 64',
  gamecube: 'GameCube',
  wii: 'Wii',
  'wii-u': 'Wii U',
  'game-boy': 'Game Boy',
  gba: 'Game Boy Advance',
  ds: 'Nintendo DS',
  '3ds': 'Nintendo 3DS',
  genesis: 'Genesis',
  ps1: 'PlayStation',
  ps2: 'PlayStation 2',
  psp: 'PSP',
  vita: 'PS Vita',
  'atari-2600': 'Atari 2600',
  'retro-other': 'Other retro',
};

/** Short forms for chips on a 170px card. Missing → the full label. */
const PLATFORM_SHORT = {
  'steam-deck': 'Deck',
  ps5: 'PS5',
  ps4: 'PS4',
  ps3: 'PS3',
  'xbox-series': 'Series X|S',
  'xbox-one': 'Xbox One',
  'xbox-360': '360',
  ios: 'iOS',
  n64: 'N64',
  gamecube: 'GC',
  'game-boy': 'GB',
  gba: 'GBA',
  ds: 'DS',
  '3ds': '3DS',
  ps1: 'PS1',
  ps2: 'PS2',
  vita: 'Vita',
  'atari-2600': '2600',
  'retro-other': 'Retro',
};

const STOREFRONT_LABELS = {
  steam: 'Steam',
  gog: 'GOG',
  epic: 'Epic Games',
  amazon: 'Amazon / Prime Gaming',
  luna: 'Amazon Luna',
  itch: 'itch.io',
  ea: 'EA app',
  ubisoft: 'Ubisoft Connect',
  'battle-net': 'Battle.net',
  xbox: 'Xbox / Game Pass',
  microsoft: 'Microsoft Store',
  playstation: 'PlayStation Store',
  nintendo: 'Nintendo eShop',
  apple: 'App Store',
  'google-play': 'Google Play',
  retail: 'Retail (boxed)',
  other: 'Other',
};

const FORMAT_LABELS = { physical: 'Physical', digital: 'Digital', subscription: 'Game Pass / subscription' };

const MODE_LABELS = {
  single: 'Single-player',
  'coop-local': 'Couch co-op',
  'coop-online': 'Online co-op',
  'pvp-local': 'Local versus',
  'pvp-online': 'Online versus',
};

const COMPLETION_LABELS = { story: 'Story', extra: 'Story + extras', complete: '100%' };

const HOURS_SOURCE_LABELS = { manual: 'Logged by you', steam: 'From Steam', playnite: 'From Playnite' };

/** Title-case a slug: "retro-other" → "Retro Other", "ps5" → "Ps5". */
export function humanize(id) {
  if (id === null || id === undefined || id === '') return '';
  return String(id)
    .replace(/^custom-/, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const lookup = (map) => (id) => (id && map[id]) || humanize(id);

export const platformLabel = lookup(PLATFORM_LABELS);
export const storefrontLabel = lookup(STOREFRONT_LABELS);
export const formatLabel = lookup(FORMAT_LABELS);
export const modeLabel = lookup(MODE_LABELS);
export const completionLabel = lookup(COMPLETION_LABELS);
export const hoursSourceLabel = lookup(HOURS_SOURCE_LABELS);

export function platformShort(id) {
  if (!id) return '';
  return PLATFORM_SHORT[id] || platformLabel(id);
}

/**
 * A shelf's label. Custom shelves (`custom-<slug>`) are named by the profile;
 * pass its `customShelves` so the user's own label wins over the slug.
 */
export function shelfLabel(id, customShelves = []) {
  if (!id) return '';
  if (SHELF_LABELS[id]) return SHELF_LABELS[id];
  const custom = customShelves.find((s) => s.id === id);
  return custom?.label || humanize(id);
}

/** Platform families drive the little glyph on plates and chips. */
const FAMILY = {
  pc: 'desktop', mac: 'desktop', linux: 'desktop',
  'steam-deck': 'handheld', switch: 'handheld', 'switch-2': 'handheld', 'game-boy': 'handheld',
  gba: 'handheld', ds: 'handheld', '3ds': 'handheld', psp: 'handheld', vita: 'handheld',
  ios: 'mobile', android: 'mobile',
  cloud: 'cloud',
};

export function platformFamily(id) {
  return FAMILY[id] || 'console';
}

/** Sensible default storefront for a platform's digital copy. */
export function defaultStorefrontFor(platform) {
  switch (platform) {
    case 'pc':
    case 'steam-deck':
    case 'linux':
    case 'mac':
      return 'steam';
    case 'switch':
    case 'switch-2':
    case '3ds':
    case 'wii-u':
      return 'nintendo';
    case 'ps5':
    case 'ps4':
    case 'ps3':
    case 'vita':
      return 'playstation';
    case 'xbox-series':
    case 'xbox-one':
    case 'xbox-360':
      return 'xbox';
    case 'ios':
      return 'apple';
    case 'android':
      return 'google-play';
    case 'cloud':
      return 'luna';
    default:
      return '';
  }
}

/** Order a platform id list the way the vocabulary lists them. */
export function sortPlatforms(ids = [], order = DEFAULT_VOCAB.platforms) {
  const rank = (id) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b));
}
