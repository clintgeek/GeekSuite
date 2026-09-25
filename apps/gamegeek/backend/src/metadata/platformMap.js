/**
 * Provider platform/mode vocabulary → GameGeek's closed vocabulary
 * (@geeksuite/schemas/gamegeek/constants PLATFORMS / GAME_MODES).
 *
 * Deliberately a map, not a fallback guess: DOCS/GameGeekPlan.md §4.2 says
 * "map platforms to our vocabulary where obvious, drop unknown" — an
 * unrecognized platform name is left out of the candidate rather than
 * coerced into something wrong.
 */

/** IGDB `platforms[].name` (fields=platforms.name) → our PLATFORMS. */
export const IGDB_PLATFORM_MAP = {
  'PC (Microsoft Windows)': 'pc',
  'Mac': 'mac',
  'Linux': 'linux',
  'Nintendo Switch': 'switch',
  'Nintendo Switch 2': 'switch-2',
  'PlayStation 5': 'ps5',
  'PlayStation 4': 'ps4',
  'PlayStation 3': 'ps3',
  'PlayStation 2': 'ps2',
  'PlayStation': 'ps1',
  'PlayStation Vita': 'vita',
  'PlayStation Portable': 'psp',
  'Xbox Series X|S': 'xbox-series',
  'Xbox One': 'xbox-one',
  'Xbox 360': 'xbox-360',
  'iOS': 'ios',
  'Android': 'android',
  'Google Stadia': 'cloud',
  'Arcade': 'arcade',
  'Nintendo Entertainment System': 'nes',
  'Super Nintendo Entertainment System': 'snes',
  'Nintendo 64': 'n64',
  'Nintendo GameCube': 'gamecube',
  'Wii': 'wii',
  'Wii U': 'wii-u',
  'Game Boy': 'game-boy',
  'Game Boy Advance': 'gba',
  'Nintendo DS': 'ds',
  'Nintendo 3DS': '3ds',
  'Sega Mega Drive/Genesis': 'genesis',
  'Atari 2600': 'atari-2600',
};

/** RAWG `platforms[].platform.name` → our PLATFORMS. */
export const RAWG_PLATFORM_MAP = {
  PC: 'pc',
  macOS: 'mac',
  Linux: 'linux',
  'Nintendo Switch': 'switch',
  'PlayStation 5': 'ps5',
  'PlayStation 4': 'ps4',
  'PlayStation 3': 'ps3',
  'PlayStation 2': 'ps2',
  PlayStation: 'ps1',
  'PS Vita': 'vita',
  PSP: 'psp',
  'Xbox Series S/X': 'xbox-series',
  'Xbox One': 'xbox-one',
  'Xbox 360': 'xbox-360',
  iOS: 'ios',
  Android: 'android',
  'Wii U': 'wii-u',
  Wii: 'wii',
  GameCube: 'gamecube',
  'Nintendo 64': 'n64',
  'Game Boy Advance': 'gba',
  'Game Boy': 'game-boy',
  'Nintendo DS': 'ds',
  'Nintendo 3DS': '3ds',
  SNES: 'snes',
  NES: 'nes',
  Genesis: 'genesis',
  'Atari 2600': 'atari-2600',
};

/** RAWG `tags[].slug` → our GAME_MODES. RAWG has no mode field; these tags are the closest. */
export const RAWG_MODE_TAG_MAP = {
  singleplayer: 'single',
  'co-op': 'coop-online',
  'online-co-op': 'coop-online',
  'local-co-op': 'coop-local',
  'split-screen': 'coop-local',
  pvp: 'pvp-online',
  'online-pvp': 'pvp-online',
  'local-pvp': 'pvp-local',
  multiplayer: 'pvp-online',
};

/** IGDB `game_modes[].name` (fields=game_modes.name) → our GAME_MODES. Best effort. */
export const IGDB_MODE_MAP = {
  'Single player': 'single',
  'Split screen': 'coop-local',
  'Co-operative': 'coop-online',
  'Multiplayer': 'pvp-online',
  'Battle Royale': 'pvp-online',
};

/** Steam Store API `categories[].description` → our GAME_MODES. Best effort. */
export const STEAM_MODE_MAP = {
  'Single-player': 'single',
  'Co-op': 'coop-online',
  'Online Co-op': 'coop-online',
  'Local Co-op': 'coop-local',
  'Shared/Split Screen': 'coop-local',
  'Shared/Split Screen Co-op': 'coop-local',
  'Shared/Split Screen PvP': 'pvp-local',
  'PvP': 'pvp-online',
  'Online PvP': 'pvp-online',
  'LAN PvP': 'pvp-local',
  'Multi-player': 'pvp-online',
  'MMO': 'pvp-online',
};

/**
 * @param {string[]} names
 * @param {Record<string,string>} map
 * @returns {string[]} mapped values, unknown names dropped, de-duplicated.
 */
export function mapNames(names, map) {
  if (!Array.isArray(names)) return [];
  const out = [];
  for (const name of names) {
    const mapped = map[name];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

export default { IGDB_PLATFORM_MAP, IGDB_MODE_MAP, STEAM_MODE_MAP, RAWG_PLATFORM_MAP, RAWG_MODE_TAG_MAP, mapNames };
