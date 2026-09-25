import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import Game from '../models/Game.js';
import GamePlayer from '../models/GamePlayer.js';
import Profile from '../models/Profile.js';
import householdModule from '@geeksuite/schemas/gamegeek/household';
import { parseSteamIdInput } from '../steam/steamId.js';
import { buildSteamImportPlan, shelfForPlaytimeMinutes } from '../steam/importPlanner.js';
import { isSteamImportConfigured, resolveVanityUrl, getOwnedGames } from '../metadata/steamWebApi.js';
import { fetchImageBuffer } from '../lib/coverFetch.js';
import { steamLibraryCoverUrl } from '../metadata/steam.js';
import { COVER_HOSTS } from '../metadata/coverHosts.js';
import { ensureCoversDir, resolveCoverPath } from '../lib/coverStorage.js';
import { runWithConcurrency } from '../lib/concurrency.js';
import { sniffCoverImage } from '../lib/imageSniff.js';
import fs from 'node:fs';

const { resolveHouseholdId } = householdModule;

const router = express.Router();

const importBodySchema = z.object({
  steamId: z.string().trim().min(1).max(200).optional(),
  dryRun: z.boolean().default(true),
});

/** Background, best-effort: fetch a `library_600x900` cover for each newly created game that has none yet. Never awaited by the response. */
async function backfillCoversInBackground(games, logger) {
  const targets = games.filter((g) => g.externalIds?.steamAppId && !g.coverPath);
  if (!targets.length) return;
  ensureCoversDir();
  await runWithConcurrency(targets, 3, async (game) => {
    const buffer = await fetchImageBuffer(steamLibraryCoverUrl(game.externalIds.steamAppId), {
      allowedHosts: COVER_HOSTS,
      logger,
    });
    if (!buffer) return;
    const sniffed = sniffCoverImage(buffer);
    if (!sniffed) return;
    const filename = `${game.id}.${sniffed.ext}`;
    fs.writeFileSync(resolveCoverPath(game.id, sniffed.ext), buffer);
    await Game.updateOne({ _id: game._id }, { $set: { coverPath: filename } });
  });
}

router.post('/steam', authenticate, async (req, res) => {
  if (!isSteamImportConfigured()) {
    return res.json({ configured: false, message: 'STEAM_API_KEY is not set — Steam import is unavailable' });
  }

  const parsed = importBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid request body', code: 'VALIDATION_ERROR' });
  }
  const { steamId, dryRun } = parsed.data;
  const householdId = resolveHouseholdId(req.user);
  const userId = req.user.id;

  try {
    // Resolve a SteamID64 to import against: an explicit id/vanity/URL from
    // the caller, or the one already on file for this user.
    let steamId64;
    if (steamId) {
      const parsedInput = parseSteamIdInput(steamId);
      if (!parsedInput) {
        return res.status(400).json({ message: 'Could not understand that Steam ID', code: 'VALIDATION_ERROR' });
      }
      if (parsedInput.type === 'id64') {
        steamId64 = parsedInput.value;
      } else {
        steamId64 = await resolveVanityUrl(parsedInput.value);
        if (!steamId64) {
          return res.status(400).json({ message: 'Could not resolve that Steam vanity URL', code: 'STEAM_VANITY_NOT_FOUND' });
        }
      }
    } else {
      const profile = await Profile.findOne({ userId });
      if (!profile?.steamId) {
        return res.status(400).json({
          message: 'No Steam ID on file — provide one or set it in Settings first',
          code: 'STEAM_ID_REQUIRED',
        });
      }
      steamId64 = profile.steamId;
    }

    const owned = await getOwnedGames(steamId64);
    if (!owned) {
      // Detect a private profile rather than silently "importing" zero
      // games (DOCS/GameGeekPlan.md §7/§12).
      return res.json({
        configured: true,
        private: true,
        message: 'Steam returned no games — is the profile/game details privacy set to Public?',
      });
    }

    const appIds = owned.games.map((g) => String(g.appid));
    const existingGames = await Game.find({ householdId, 'externalIds.steamAppId': { $in: appIds } });
    const existingGamesByAppId = new Map(existingGames.map((g) => [g.externalIds.steamAppId, g]));

    const gameIds = existingGames.map((g) => g._id);
    const existingPlayers = await GamePlayer.find({ userId, gameId: { $in: gameIds } });
    const existingPlayersByGameId = new Map(existingPlayers.map((p) => [String(p.gameId), p]));

    const plan = buildSteamImportPlan({ ownedGames: owned.games, existingGamesByAppId, existingPlayersByGameId });

    if (dryRun) {
      return res.json({
        configured: true,
        total: plan.total,
        // `minutes` is internal (the commit path's shelf decision) and not
        // part of the documented dry-run response shape.
        toCreate: plan.toCreate.map(({ steamAppId, gameId, title, hours }) => ({ steamAppId, gameId, title, hours })),
        toUpdateHours: plan.toUpdateHours,
        unchanged: plan.unchanged,
      });
    }

    // Commit. Never a destructive op: everything below is a create or a
    // targeted $set, never a deleteMany/updateMany-wide write.
    const createdGames = [];

    for (const item of plan.toCreate) {
      let game;
      if (item.gameId) {
        game = existingGamesByAppId.get(item.steamAppId);
      } else {
        game = await Game.create({
          householdId,
          title: item.title,
          source: 'steam-import',
          externalIds: { steamAppId: item.steamAppId },
          copies: [{ platform: 'pc', format: 'digital', storefront: 'steam' }],
          platformsAvailable: ['pc'],
        });
        createdGames.push(game);
      }

      await GamePlayer.findOneAndUpdate(
        { userId, gameId: game._id },
        {
          $setOnInsert: {
            userId,
            householdId,
            gameId: game._id,
            shelf: shelfForPlaytimeMinutes(item.minutes),
            hoursPlayed: item.hours,
            hoursSource: 'steam',
          },
        },
        { upsert: true, new: true },
      );
    }

    for (const item of plan.toUpdateHours) {
      // Scoped to hoursSource: 'steam' by construction — the planner never
      // puts a manual-hours row in this bucket (see importPlanner.js).
      await GamePlayer.updateOne(
        { userId, gameId: item.gameId, hoursSource: 'steam' },
        { $set: { hoursPlayed: item.hours } },
      );
    }

    await Profile.findOneAndUpdate(
      { userId },
      { $set: { householdId, userId, steamId: steamId64, lastSteamSyncAt: new Date() } },
      { upsert: true },
    );

    // Fire-and-forget: covers must not hold the response open.
    backfillCoversInBackground(createdGames, req.log).catch((err) => {
      req.log?.error?.({ err: err?.message }, 'steam import cover backfill failed');
    });

    return res.json({
      configured: true,
      total: plan.total,
      created: plan.toCreate.length,
      hoursUpdated: plan.toUpdateHours.length,
      unchanged: plan.unchanged,
    });
  } catch (err) {
    req.log?.error?.({ err: err?.message }, 'steam import failed');
    return res.status(502).json({ message: 'Steam import failed', code: 'STEAM_IMPORT_ERROR' });
  }
});

export default router;
