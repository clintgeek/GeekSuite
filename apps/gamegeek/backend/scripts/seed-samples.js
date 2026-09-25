#!/usr/bin/env node
/**
 * Idempotent sample-data seed for local/dev GameGeek instances.
 *
 * Usage:
 *   node scripts/seed-samples.js                  # games only
 *   node scripts/seed-samples.js --user <userId>   # + GamePlayer rows for that user
 *   node scripts/seed-samples.js --covers          # also try fetching covers (Hades only — it's the one sample with a steamAppId)
 *
 * Safe to re-run: a game already present (matched by title, within the
 * default household) is skipped, never duplicated. Same for GamePlayer rows
 * when --user is given.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';

import Game from '../src/models/Game.js';
import GamePlayer from '../src/models/GamePlayer.js';
import householdModule from '@geeksuite/schemas/gamegeek/household';
import { fetchImageBuffer } from '../src/lib/coverFetch.js';
import { sniffCoverImage } from '../src/lib/imageSniff.js';
import { steamLibraryCoverUrl } from '../src/metadata/steam.js';
import { COVER_HOSTS } from '../src/metadata/coverHosts.js';
import { ensureCoversDir, resolveCoverPath } from '../src/lib/coverStorage.js';

const { DEFAULT_HOUSEHOLD_ID } = householdModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, '..', envFile) });

const args = process.argv.slice(2);
const withCovers = args.includes('--covers');
const userFlagIndex = args.indexOf('--user');
const userId = userFlagIndex >= 0 ? args[userFlagIndex + 1] : null;

const SAMPLE_GAMES = [
  {
    title: 'Pac-Man',
    releaseDate: '1980-01-01',
    developers: ['Namco'],
    publishers: ['Namco'],
    genres: ['Arcade', 'Maze'],
    platformsAvailable: ['arcade'],
    copies: [{ platform: 'arcade', format: 'physical' }],
    shelf: 'finished',
    rating: 4,
  },
  {
    title: 'Tetris',
    releaseDate: '1989-01-01',
    developers: ['Nintendo'],
    publishers: ['Nintendo'],
    genres: ['Puzzle'],
    platformsAvailable: ['game-boy'],
    copies: [{ platform: 'game-boy', format: 'physical' }],
    shelf: 'playing',
    rating: null,
  },
  {
    title: 'Castlevania',
    releaseDate: '1986-01-01',
    developers: ['Konami'],
    publishers: ['Konami'],
    genres: ['Action', 'Platformer'],
    platformsAvailable: ['nes'],
    copies: [{ platform: 'nes', format: 'physical' }],
    shelf: 'backlog',
    rating: null,
  },
  {
    title: 'Super Mario Bros.',
    releaseDate: '1985-01-01',
    developers: ['Nintendo'],
    publishers: ['Nintendo'],
    genres: ['Platformer'],
    platformsAvailable: ['nes'],
    copies: [{ platform: 'nes', format: 'physical' }],
    shelf: 'finished',
    rating: 5,
  },
  {
    title: 'The Legend of Zelda: A Link to the Past',
    releaseDate: '1991-01-01',
    developers: ['Nintendo'],
    publishers: ['Nintendo'],
    genres: ['Action-Adventure'],
    platformsAvailable: ['snes'],
    copies: [{ platform: 'snes', format: 'physical' }],
    shelf: 'wishlist',
    rating: null,
  },
  {
    title: 'Hades',
    releaseDate: '2020-01-01',
    developers: ['Supergiant Games'],
    publishers: ['Supergiant Games'],
    genres: ['Roguelike'],
    platformsAvailable: ['pc', 'switch'],
    externalIds: { steamAppId: '1145360' },
    copies: [{ platform: 'pc', format: 'digital', storefront: 'steam' }],
    shelf: 'playing',
    rating: 4.5,
  },
];

async function seedGame(sample) {
  const existing = await Game.findOne({ householdId: DEFAULT_HOUSEHOLD_ID, title: sample.title });
  if (existing) {
    console.log(`skip (exists): ${sample.title}`);
    return existing;
  }

  const game = await Game.create({
    householdId: DEFAULT_HOUSEHOLD_ID,
    title: sample.title,
    releaseDate: new Date(sample.releaseDate),
    developers: sample.developers,
    publishers: sample.publishers,
    genres: sample.genres,
    platformsAvailable: sample.platformsAvailable,
    externalIds: sample.externalIds || {},
    copies: sample.copies,
    source: 'sample',
  });
  console.log(`created: ${sample.title}`);
  return game;
}

async function seedGamePlayer(game, sample) {
  const existing = await GamePlayer.findOne({ userId, gameId: game._id });
  if (existing) {
    console.log(`skip (player exists): ${sample.title}`);
    return;
  }
  await GamePlayer.create({
    userId,
    householdId: DEFAULT_HOUSEHOLD_ID,
    gameId: game._id,
    shelf: sample.shelf,
    rating: sample.rating,
  });
  console.log(`created player row: ${sample.title} (${sample.shelf})`);
}

async function seedCover(game, sample) {
  if (!sample.externalIds?.steamAppId || game.coverPath) return;
  const buffer = await fetchImageBuffer(steamLibraryCoverUrl(sample.externalIds.steamAppId), {
    allowedHosts: COVER_HOSTS,
  });
  if (!buffer) {
    console.log(`cover fetch failed: ${sample.title}`);
    return;
  }
  const sniffed = sniffCoverImage(buffer);
  if (!sniffed) {
    console.log(`cover fetch returned an unrecognized image: ${sample.title}`);
    return;
  }
  ensureCoversDir();
  fs.writeFileSync(resolveCoverPath(game.id, sniffed.ext), buffer);
  await Game.updateOne({ _id: game._id }, { $set: { coverPath: `${game.id}.${sniffed.ext}` } });
  console.log(`cover saved: ${sample.title}`);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  for (const sample of SAMPLE_GAMES) {
    const game = await seedGame(sample);
    if (userId) await seedGamePlayer(game, sample);
    if (withCovers) await seedCover(game, sample);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('seed-samples failed:', err?.message || err);
  process.exitCode = 1;
});
