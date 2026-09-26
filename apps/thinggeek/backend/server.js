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
const { default: createApp } = await import('./src/app.js');
const { ensureFilesRoot, filesRoot } = await import('./src/lib/fileStorage.js');
const { startPurgeSchedule } = await import('./src/jobs/purge.js');
const { default: Thing } = await import('./src/models/Thing.js');
const { default: ThingFile } = await import('./src/models/ThingFile.js');

const PORT = Number(process.env.PORT) || 1820;

const app = createApp();

async function connectDB() {
  logger.info('Connecting to MongoDB');
  await mongoose.connect(process.env.MONGODB_URI);
  logger.info({ db: mongoose.connection.db.databaseName }, 'MongoDB connected');
}

let shuttingDown = false;
let server;
let purge = { stop() {} };

function shutdown(signal) {
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

  const closed = async () => {
    purge.stop();
    // Still connecting (readyState 2)? disconnect() would wait out server
    // selection (30 s) and the force timer would turn a clean stop into exit 1.
    if (mongoose.connection.readyState !== 1) process.exit(0);
    try {
      await mongoose.disconnect();
    } catch (err) {
      logger.error({ err: { name: err?.name } }, 'Error disconnecting mongoose');
    }
    process.exit(0);
  };

  // A signal can arrive before listen() (container stopped while Mongo is
  // still connecting) — `server` is undefined then.
  if (!server) {
    closed();
    return;
  }
  server.close(closed);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

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

  server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`ThingGeek API server running on port ${PORT}`);
  });

  // Trash purge: ~60 s after boot, then daily. Production (or
  // PURGE_AUTORUN=1) only; PURGE_DISABLED=1 turns it off.
  purge = startPurgeSchedule({ Thing, ThingFile, log: logger });
}

start();
