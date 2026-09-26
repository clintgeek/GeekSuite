/**
 * Shared plan/commit path for a validated Playnite export
 * (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md). Used by both the upload route
 * (routes/playniteRoutes.js, source 'upload') and the Nextcloud drop watcher
 * (playnite/dropWatcher.js, source 'folder') so the two front doors can never
 * disagree about what a commit does.
 */
import mongoose from 'mongoose';
import { planPlayniteImport } from './importPlanner.js';
import { commitPlayniteImport } from './commit.js';

export const GAME_FIELDS = { title: 1, genres: 1, releaseDate: 1, platformsAvailable: 1, externalIds: 1, copies: 1 };
export const PLAYER_FIELDS = {
  gameId: 1, shelf: 1, hoursPlayed: 1, hoursSource: 1, lastPlayedAt: 1, installFlag: 1, installFlagDismissedAt: 1,
};

/**
 * Read the household/user's current state and compute the plan a commit
 * would apply. Pure with respect to the database — no writes.
 *
 * @param {object} params
 * @param {object} params.parsed parse.js's `parseExport()` result
 * @param {string} params.householdId
 * @param {string} params.userId
 * @param {boolean} params.includeHidden
 * @param {Date} params.now
 * @param {object} params.Game mongoose model
 * @param {object} params.GamePlayer mongoose model
 */
export async function buildPlaynitePlan({ parsed, householdId, userId, includeHidden, now, Game, GamePlayer }) {
  const [existingGames, existingPlayers] = await Promise.all([
    Game.find({ householdId }, GAME_FIELDS).lean(),
    GamePlayer.find({ userId, householdId }, PLAYER_FIELDS).lean(),
  ]);
  return planPlayniteImport({
    entries: parsed.entries,
    existingGames,
    existingPlayers,
    userId,
    includeHidden,
    now,
    seenPlayniteIds: parsed.seenPlayniteIds,
    invalid: parsed.invalid,
    total: parsed.total,
  });
}

/**
 * Apply a plan and stamp the profile. Callers that also need to serialize
 * against other writers should wrap this (not `buildPlaynitePlan`, which only
 * reads) in `withImportLock` — see importLock.js.
 *
 * @param {object} params
 * @param {{ops: object, total: number}} params.plan
 * @param {string} params.householdId
 * @param {string} params.userId
 * @param {string|null} params.generatedAtUtc the export's own `generatedAtUtc`
 * @param {'upload'|'folder'} params.source
 * @param {object} params.Game
 * @param {object} params.GamePlayer
 * @param {object} params.Profile
 * @param {() => any} [params.newId]
 */
export async function commitPlaynitePlan({
  plan, householdId, userId, generatedAtUtc, source, Game, GamePlayer, Profile,
  newId = () => new mongoose.Types.ObjectId(),
}) {
  await commitPlayniteImport({ plan, householdId, userId, Game, GamePlayer, newId });

  const generated = generatedAtUtc ? new Date(generatedAtUtc) : null;
  await Profile.findOneAndUpdate(
    { userId },
    {
      $set: {
        householdId,
        userId,
        'playnite.lastImportAt': new Date(),
        'playnite.lastGeneratedAtUtc': generated && !Number.isNaN(generated.getTime()) ? generated : null,
        'playnite.lastTotal': plan.total,
        'playnite.lastSource': source,
      },
    },
    { upsert: true },
  );
}

export default { buildPlaynitePlan, commitPlaynitePlan, GAME_FIELDS, PLAYER_FIELDS };
