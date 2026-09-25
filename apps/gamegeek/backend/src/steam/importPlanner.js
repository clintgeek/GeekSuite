/**
 * Pure planning function for the Steam library import
 * (DOCS/GameGeekPlan.md §7): given the caller's owned Steam games and what
 * the household/this user already has, decide what a commit would do,
 * without touching the database. Both the dry-run response and the actual
 * commit are built from this same plan, so they can never disagree.
 *
 * "Never overwrite manual hours" and idempotency (re-running produces zero
 * duplicates) both fall out of the same rule: a game already matched by
 * `externalIds.steamAppId` is never re-created, and an existing GamePlayer
 * row only has its hours touched when `hoursSource === 'steam'`.
 */

export function round1(n) {
  return Math.round(n * 10) / 10;
}

/** `0 minutes → backlog`, `>0 minutes → on-hold` (DOCS/GameGeekPlan.md §7). */
export function shelfForPlaytimeMinutes(minutes) {
  return minutes > 0 ? 'on-hold' : 'backlog';
}

/**
 * @param {object} params
 * @param {{appid: number|string, name: string, playtime_forever: number}[]} params.ownedGames
 *   Steam's `GetOwnedGames` entries.
 * @param {Map<string, {_id: any, title: string}>} params.existingGamesByAppId
 *   household games already matched by `externalIds.steamAppId` (string key).
 * @param {Map<string, {hoursSource: string, hoursPlayed: number}>} params.existingPlayersByGameId
 *   the caller's own GamePlayer rows, keyed by `String(gameId)`.
 * @returns {{
 *   total: number,
 *   toCreate: {steamAppId: string, gameId?: string, title: string, hours: number, minutes: number}[],
 *   toUpdateHours: {gameId: string, title: string, hours: number}[],
 *   unchanged: number,
 * }}
 *
 * `toCreate[].minutes` carries the raw (unrounded) Steam playtime alongside
 * `hours`, so the commit path can apply the plan's doc "0 minutes → backlog,
 * >0 → on-hold" rule exactly — `hours` alone rounds to one decimal and would
 * misclassify a couple of minutes of playtime as untouched.
 */
export function buildSteamImportPlan({ ownedGames, existingGamesByAppId, existingPlayersByGameId }) {
  const games = Array.isArray(ownedGames) ? ownedGames : [];
  const toCreate = [];
  const toUpdateHours = [];
  let unchanged = 0;

  for (const owned of games) {
    const appId = String(owned.appid);
    const minutes = owned.playtime_forever || 0;
    const hours = round1(minutes / 60);
    const existingGame = existingGamesByAppId?.get(appId);

    if (!existingGame) {
      toCreate.push({ steamAppId: appId, title: owned.name, hours, minutes });
      continue;
    }

    const gameId = String(existingGame._id);
    const player = existingPlayersByGameId?.get(gameId);

    if (!player) {
      // The household already has this game (added another way, or a prior
      // partial import), but this caller has no GamePlayer row for it yet —
      // that row still needs creating, just against the existing Game.
      toCreate.push({ steamAppId: appId, gameId, title: existingGame.title, hours, minutes });
      continue;
    }

    if (player.hoursSource !== 'steam') {
      // Manual hours are never overwritten by a Steam sync.
      unchanged += 1;
      continue;
    }

    if (round1(player.hoursPlayed || 0) === hours) {
      unchanged += 1;
      continue;
    }

    toUpdateHours.push({ gameId, title: existingGame.title, hours });
  }

  return { total: games.length, toCreate, toUpdateHours, unchanged };
}

export default { round1, shelfForPlaytimeMinutes, buildSteamImportPlan };
