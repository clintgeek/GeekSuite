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

/**
 * The enrichment detail fetch (one game by id). `external_games.*` and
 * `multiplayer_modes.*` are wildcards on purpose: IGDB renamed
 * `external_games.category` to `external_game_source` in 2025 and an
 * explicitly named field that no longer exists 400s the whole query. The
 * normalizer reads whichever of the two is present.
 */
export const IGDB_DETAIL_FIELDS = [
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
  'external_games.*',
  'multiplayer_modes.*',
  'themes.name',
  'keywords.name',
  'player_perspectives.name',
].join(',');

/** The tags pass's batched fetch (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §A2). */
export const IGDB_TAG_FIELDS = ['themes.name', 'keywords.name', 'player_perspectives.name'].join(',');

/**
 * `/external_games` lookup by Steam app id. Confirmed live 2026-09-25: rows
 * carry `game` (the IGDB game id), `uid` (the Steam app id as a string) and
 * `external_game_source` (1 = Steam); `category` is gone from the response.
 */
export const IGDB_EXTERNAL_GAME_FIELDS = ['game', 'uid', 'external_game_source'].join(',');

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
  const isSteam = (eg) =>
    eg?.category === IGDB_EXTERNAL_CATEGORY_STEAM || eg?.external_game_source === IGDB_EXTERNAL_CATEGORY_STEAM;
  const match = externalGames.find((eg) => isSteam(eg) && /^\d+$/.test(String(eg?.uid ?? '')));
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

const secondsToHours = (s) => (Number.isFinite(s) && s > 0 ? Math.round((s / 3600) * 10) / 10 : null);

/**
 * `game_time_to_beats` row → {main, extra, complete} hours:
 * hastily → main, normally → extra, completely → complete.
 */
export function normalizeIgdbTimeToBeat(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) return { main: null, extra: null, complete: null };
  return {
    main: secondsToHours(row.hastily),
    extra: secondsToHours(row.normally),
    complete: secondsToHours(row.completely),
  };
}

/** multiplayer_modes[] → extra modes and the biggest couch player count. */
function fromMultiplayerModes(list) {
  const modes = [];
  let maxLocal = null;
  for (const mm of Array.isArray(list) ? list : []) {
    if (!mm || typeof mm !== 'object') continue;
    if (mm.offlinecoop && !modes.includes('coop-local')) modes.push('coop-local');
    if (mm.onlinecoop && !modes.includes('coop-online')) modes.push('coop-online');
    for (const n of [mm.offlinecoopmax, mm.offlinemax]) {
      if (Number.isInteger(n) && n > 1 && (maxLocal == null || n > maxLocal)) maxLocal = n;
    }
  }
  return { modes, maxLocal };
}

/**
 * The full enrichment candidate: normalizeIgdbGame + multiplayer modes,
 * max local players, time-to-beat and the cover download list.
 */
export function normalizeIgdbDetail(game, timeToBeatRows = []) {
  const base = normalizeIgdbGame(game);
  const mp = fromMultiplayerModes(game?.multiplayer_modes);
  const modes = [...base.modes];
  for (const m of mp.modes) if (!modes.includes(m)) modes.push(m);
  const coverBig = game?.cover?.image_id
    ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${game.cover.image_id}.jpg`
    : null;
  return {
    ...base,
    modes,
    maxLocalPlayers: mp.maxLocal,
    timeToBeat: normalizeIgdbTimeToBeat(timeToBeatRows),
    tagTerms: igdbTagTerms(game),
    coverUrls: [coverBig, base.coverUrl].filter(Boolean),
  };
}

const namesOf = (list) => (Array.isArray(list) ? list.map((x) => x?.name).filter((n) => typeof n === 'string' && n) : []);

/**
 * A game's raw tag terms, in the order the mapper should see them: themes
 * (the most deliberate), then keywords, then player perspectives.
 */
export function igdbTagTerms(game) {
  return [...namesOf(game?.themes), ...namesOf(game?.keywords), ...namesOf(game?.player_perspectives)];
}

/** `/games` rows from the batched tag fetch → Map<igdb id string, terms[]>. */
export function normalizeIgdbTagRows(rows) {
  const out = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.id == null) continue;
    out.set(String(row.id), igdbTagTerms(row));
  }
  return out;
}

/**
 * `/external_games` rows → Map<steam app id, igdb game id>. A Steam id that
 * points at more than one IGDB game is ambiguous and left out: guessing
 * would attach the wrong game's id.
 */
export function normalizeIgdbSteamLookup(rows) {
  const byUid = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const source = row?.external_game_source ?? row?.category;
    if (source !== IGDB_EXTERNAL_CATEGORY_STEAM) continue;
    const uid = String(row?.uid ?? '');
    const game = typeof row?.game === 'object' && row.game ? row.game.id : row?.game;
    if (!/^\d+$/.test(uid) || !Number.isInteger(Number(game)) || game == null) continue;
    if (!byUid.has(uid)) byUid.set(uid, new Set());
    byUid.get(uid).add(String(game));
  }
  const out = new Map();
  for (const [uid, games] of byUid) if (games.size === 1) out.set(uid, [...games][0]);
  return out;
}

/** @param {object[]} games the IGDB `/games` response array. */
export function normalizeIgdbSearchResults(games) {
  if (!Array.isArray(games)) return [];
  return games.map(normalizeIgdbGame);
}

export default {
  IGDB_EXTERNAL_CATEGORY_STEAM,
  IGDB_GAME_FIELDS,
  IGDB_DETAIL_FIELDS,
  IGDB_TAG_FIELDS,
  IGDB_EXTERNAL_GAME_FIELDS,
  igdbTagTerms,
  normalizeIgdbTagRows,
  normalizeIgdbSteamLookup,
  unixSecondsToUtcMidnightIso,
  normalizeIgdbTimeToBeat,
  normalizeIgdbDetail,
  normalizeIgdbGame,
  normalizeIgdbSearchResults,
};
