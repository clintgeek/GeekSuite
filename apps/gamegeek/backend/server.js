import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './src/lib/logger.js';
import createApp from './src/app.js';
import { ensureCoversDir } from './src/lib/coverStorage.js';
import { startEnrichmentSchedule } from './src/enrichment/service.js';
import { startPlayniteDropImport } from './src/playnite/dropWatcher.js';
import Game from './src/models/Game.js';
import { migrateGenres } from './src/migrations/genres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const PORT = process.env.PORT || 1810;

const app = createApp();

const connectDB = async () => {
  logger.info({ uri: process.env.MONGODB_URI?.replace(/:\/\/(.*)@/, '://******:******@') }, 'Connecting to MongoDB');
  await mongoose.connect(process.env.MONGODB_URI);
  logger.info({ db: mongoose.connection.db.databaseName }, 'MongoDB connected');
};

let shuttingDown = false;
let server;
let dropWatcher = { stop: async () => {} };

const shutdown = (signal) => {
  if (shuttingDown) {
    logger.info(`${signal} received during shutdown — forcing exit`);
    process.exit(1);
  }
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  const forceTimer = setTimeout(() => {
    logger.error('Shutdown timed out after 15s — forcing exit');
    process.exit(1);
  }, 15_000);
  forceTimer.unref();

  // A signal can arrive before `listen()` — the container is stopped while
  // connectDB is still waiting on Mongo, say. `server` is undefined then, and
  // dereferencing it turned a clean SIGTERM into a TypeError and a non-zero
  // exit.
  const closed = async () => {
    try {
      await dropWatcher.stop();
    } catch (err) {
      logger.error({ err }, 'Error stopping the Playnite drop import');
    }
    try {
      await mongoose.disconnect();
    } catch (err) {
      logger.error({ err }, 'Error disconnecting mongoose');
    }
    process.exit(0);
  };

  if (!server) {
    closed();
    return;
  }
  server.close(closed);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function start() {
  ensureCoversDir();

  try {
    await connectDB();
  } catch (err) {
    logger.error({ err }, 'Failed to connect to MongoDB');
    process.exit(1);
  }

  // Canonical genre names (DOCS/TAGS_AND_FILTERS.md §A5). Idempotent, runs
  // before the enrichment worker is scheduled; a failure is logged, never fatal.
  try {
    await migrateGenres({ Game, logger });
  } catch (err) {
    logger.error({ err: err?.message }, 'genre migration failed');
  }

  // Playnite exports dropped into Nextcloud (DOCS/PLAYNITE_IMPORT.md). After
  // Mongo, because the boot scan writes; a no-op unless a root is configured
  // or mounted.
  dropWatcher = startPlayniteDropImport();

  server = app.listen(PORT, '0.0.0.0', () => {
    logger.info('GameGeek API server running on port ' + PORT);
  });

  // Metadata enrichment: boot run after ~30 s, then every 6 h — production
  // (or ENRICHMENT_AUTORUN=1) only; ENRICHMENT_DISABLED=1 turns it off.
  startEnrichmentSchedule();
}

start();
