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
const { ensureFilesRoot, filesRoot } = await import('./src/lib/fileStorage.js');
const { startPurgeSchedule } = await import('./src/jobs/purge.js');
const { default: Thing } = await import('./src/models/Thing.js');
const { default: ThingFile } = await import('./src/models/ThingFile.js');
const { default: AtticModels } = await import('./src/models/Attic.js');
const { loadVaultKeyring } = await import('./src/lib/atticCrypto.js');

const PORT = Number(process.env.PORT) || 1820;

// The Attic's key (DOCS/THINGGEEK_PLAN.md "The Attic"). Missing or malformed:
// ThingGeek still runs, but every /api/attic route answers 503 — never plaintext.
const keyring = loadVaultKeyring(process.env);
if (!keyring.ok) logger.error({ event: 'attic_key_unavailable', reason: keyring.reason }, 'The Attic is closed: no usable THINGGEEK_VAULT_KEY');
else logger.info({ event: 'attic_key_loaded', keyVersion: keyring.version }, 'The Attic key is loaded');

const app = createApp({ keyring, attic: AtticModels });

async function connectDB() {
  logger.info('Connecting to MongoDB');
  await mongoose.connect(process.env.MONGODB_URI);
  logger.info({ db: mongoose.connection.db.databaseName }, 'MongoDB connected');
}

// Created up front (not by app.listen in start()) so the shutdown hooks always
// have a server to close. A signal can arrive before listen() — the container
// is stopped while connectDB is still waiting on Mongo, say — and close() on a
// server that is not listening still calls back, so onClose runs and the
// process exits 0.
const server = http.createServer(app);

let shuttingDown = false;
let purge = { stop() {} };

installShutdownHooks(logger, server, {
  onClose: async () => {
    shuttingDown = true;
    purge.stop();
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
  ensureFilesRoot();
  logger.info({ filesPath: filesRoot() }, 'file storage ready');

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
    logger.info(`ThingGeek API server running on port ${PORT}`);
  });

  // Trash purge: ~60 s after boot, then daily. Production (or
  // PURGE_AUTORUN=1) only; PURGE_DISABLED=1 turns it off.
  purge = startPurgeSchedule({ Thing, ThingFile, attic: AtticModels, log: logger });
}

start();
