/**
 * Pure normalizers for IGDB v4 `/games` responses → MetadataCandidate
 * (DOCS/GameGeekPlan.md §4.2). No network here — see igdbClient.js for the
 * Twitch OAuth + apicalypse HTTP calls. Tested against recorded fixture JSON
 * under test/fixtures/, never live.
 */
import { mapNames, IGDB_PLATFORM_MAP, IGDB_MODE_MAP } from './platformMap.js';

/** IGDB `external_games.category` enum value for Steam. */
export const IGDB_EXTERNAL_CATEGORY_STEAM = 1;

/** The apicalypse `fields` list every IGDB call in this app asks for. */
export const IGDB_GAME_FIELDS = [
  'name',
  'first_release_date',
  'summary',
  'cover.image_id',
  'genres.name',
  'game_modes.name',
  'platforms.name',
  'involved_companies.company.name',
  'involved_companies.developer',
  'involved_companies.publisher',
  'external_games.category',
  'external_games.uid',
].join(',');

/** Unix seconds (IGDB's `first_release_date`) → ISO UTC-midnight date, or null. */
export function unixSecondsToUtcMidnightIso(unixSeconds) {
  if (!Number.isFinite(unixSeconds)) return null;
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

function companiesByRole(involvedCompanies, role) {
  if (!Array.isArray(involvedCompanies)) return [];
  const out = [];
  for (const ic of involvedCompanies) {
    if (ic?.[role] && ic.company?.name && !out.includes(ic.company.name)) {
      out.push(ic.company.name);
    }
  }
  return out;
}

function findSteamAppId(externalGames) {
  if (!Array.isArray(externalGames)) return null;
  const match = externalGames.find((eg) => eg?.category === IGDB_EXTERNAL_CATEGORY_STEAM && eg?.uid);
  return match ? String(match.uid) : null;
}

/**
 * @param {object} game a single element of the IGDB `/games` response array.
 * @returns {object} MetadataCandidate
 */
export function normalizeIgdbGame(game) {
  const genres = Array.isArray(game?.genres) ? game.genres.map((g) => g?.name).filter(Boolean) : [];
  const platformNames = Array.isArray(game?.platforms) ? game.platforms.map((p) => p?.name).filter(Boolean) : [];
  const modeNames = Array.isArray(game?.game_modes) ? game.game_modes.map((m) => m?.name).filter(Boolean) : [];
  const steamAppId = findSteamAppId(game?.external_games);

  return {
    provider: 'igdb',
    providerId: String(game.id),
    title: game.name || '',
    releaseDate: unixSecondsToUtcMidnightIso(game.first_release_date),
    developers: companiesByRole(game.involved_companies, 'developer'),
    publishers: companiesByRole(game.involved_companies, 'publisher'),
    genres,
    description: game.summary || '',
    platforms: mapNames(platformNames, IGDB_PLATFORM_MAP),
    modes: mapNames(modeNames, IGDB_MODE_MAP),
    coverUrl: game?.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
      : null,
    externalIds: {
      igdb: String(game.id),
      ...(steamAppId ? { steamAppId } : {}),
    },
  };
}

/** @param {object[]} games the IGDB `/games` response array. */
export function normalizeIgdbSearchResults(games) {
  if (!Array.isArray(games)) return [];
  return games.map(normalizeIgdbGame);
}

export default {
  IGDB_EXTERNAL_CATEGORY_STEAM,
  IGDB_GAME_FIELDS,
  unixSecondsToUtcMidnightIso,
  normalizeIgdbGame,
  normalizeIgdbSearchResults,
};
