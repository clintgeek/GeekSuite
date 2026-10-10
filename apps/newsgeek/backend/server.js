import http from 'http';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Env first, then the app: ESM hoists static imports, so the modules that
// read env are loaded dynamically below, after dotenv has run. In production
// compose's env_file already set everything; this is for .env.local in dev.
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.local';
dotenv.config({ path: path.resolve(__dirname, envFile) });

const { default: logger } = await import('./src/lib/logger.js');
const { installShutdownHooks } = await import('@geeksuite/logger');
const { default: createApp } = await import('./src/app.js');
const { startPurgeSchedule } = await import('./src/jobs/purge.js');
const { createWorker } = await import('./src/jobs/worker.js');
const { runSeed } = await import('./src/seed/seed.js');
const { default: Place } = await import('./src/models/Place.js');
const { default: Source } = await import('./src/models/Source.js');
const { default: Article } = await import('./src/models/Article.js');

const PORT = Number(process.env.PORT) || 1830;

const concurrency = Math.max(1, Math.min(16, Number(process.env.INGEST_CONCURRENCY) || 4));
const worker = createWorker({ models: { Source, Place, Article }, concurrency, log: logger });

const app = createApp({ workerStatus: worker.status });

async function connectDB() {
  logger.info('Connecting to MongoDB');
  await mongoose.connect(process.env.MONGODB_URI);
  logger.info({ db: mongoose.connection.db.databaseName }, 'MongoDB connected');
}

// Created up front (not by app.listen in start()) so the shutdown hooks always
// have a server to close, even when a signal arrives during connectDB.
const server = http.createServer(app);

let shuttingDown = false;
let purge = { stop() {} };

installShutdownHooks(logger, server, {
  onClose: async () => {
    shuttingDown = true;
    purge.stop();
    // Start no new feed; give the in-flight tick a moment. Anything cut off
    // is simply polled again after the restart (state lives in Mongo).
    await worker.stop({ waitMs: 5_000 });
    // Still connecting (readyState 2)? disconnect() would wait out server
    // selection (30 s) and the force timer would fire mid-cleanup.
    if (mongoose.connection.readyState !== 1) return;
    try {
      await mongoose.disconnect();
    } catch (err) {
      logger.error({ err: { name: err?.name } }, 'Error disconnecting mongoose');
    }
  },
});

async function start() {
  try {
    await connectDB();
  } catch (err) {
    // A SIGTERM during connect disconnects mongoose, which rejects this
    // connect — that is the shutdown's exit to make (0), not a failure.
    if (shuttingDown) return;
    logger.error({ err: { name: err?.name, code: err?.code } }, 'Failed to connect to MongoDB');
    process.exit(1);
  }

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`NewsGeek API server running on port ${PORT}`);
  });

  // Indexes (the (sourceId, guid) unique index is the first dedupe layer),
  // then the seed: insert-if-absent by slug, never touching existing rows.
  try {
    await Promise.all([Place.init(), Source.init(), Article.init()]);
    await runSeed({ Place, Source, log: logger });
  } catch (err) {
    logger.error({ event: 'seed_failed', name: err?.name, code: err?.code }, 'index build or seed failed');
  }
  if (shuttingDown) return;

  // Ingest: first tick ~5 s after boot, then every 60 s. Production (or
  // INGEST_AUTORUN=1) only; INGEST_DISABLED=1 turns it off.
  worker.start();

  // Retention purge: ~60 s after boot, then daily. Production (or
  // PURGE_AUTORUN=1) only; PURGE_DISABLED=1 turns it off.
  purge = startPurgeSchedule({ Article, log: logger });
}

start();
