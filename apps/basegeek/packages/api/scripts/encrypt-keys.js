#!/usr/bin/env node
/**
 * encrypt-keys.js — One-time (idempotent) migration to encrypt AIConfig
 * API keys at rest using AES-256-GCM via cryptoVault.
 *
 * Usage:
 *   node scripts/encrypt-keys.js           # dry-run, no writes
 *   node scripts/encrypt-keys.js --yes     # actually encrypt and save
 *   node scripts/encrypt-keys.js --help    # print this usage
 *
 * Required env vars (must be set before running):
 *   KEY_VAULT_SECRET  — 64 hex chars (same value the app uses)
 *   AIGEEK_MONGODB_URI — MongoDB connection string (defaults to localhost)
 *
 * Idempotency: values already starting with "v1:" are skipped.
 * Run as many times as needed without risk of double-encrypting.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import pino from 'pino';

// ---------------------------------------------------------------------------
// Logger (pretty in dev, JSON in prod — same config as the app)
// ---------------------------------------------------------------------------
const isDev = process.env.NODE_ENV !== 'production';
const logger = pino({
  level: 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' }
    }
  })
});

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`
Usage: node scripts/encrypt-keys.js [--yes]

Encrypts plaintext API keys stored in the AIConfig collection using
AES-256-GCM (via KEY_VAULT_SECRET).  Skips values already encrypted.

Flags:
  --yes     Actually write changes. Without this flag, runs as a dry-run.
  --help    Show this message.

Required env:
  KEY_VAULT_SECRET    64-hex-char AES key (same value the API server uses)
  AIGEEK_MONGODB_URI  MongoDB connection string (default: mongodb://localhost:27017/aiGeek)

Idempotent: safe to run multiple times.
`);
  process.exit(0);
}

const DRY_RUN = !args.includes('--yes');

// ---------------------------------------------------------------------------
// Crypto — imported after env is loaded so fail-fast triggers here
// ---------------------------------------------------------------------------
// We import the vault functions directly to avoid pulling in the full app
// module graph (which expects a running Mongo connection, etc.).
import { encrypt, isEncrypted } from '../src/lib/cryptoVault.js';

// ---------------------------------------------------------------------------
// Minimal inline schema — we only touch the fields we care about
// ---------------------------------------------------------------------------
const AIGEEK_URI = process.env.AIGEEK_MONGODB_URI ||
  'mongodb://localhost:27017/aiGeek?authSource=admin';

async function run() {
  // Banner
  logger.info('=============================================================');
  logger.info(' encrypt-keys.js — AIConfig API key encryption migration');
  logger.info('=============================================================');
  logger.info({ uri: AIGEEK_URI.replace(/\/\/[^@]+@/, '//***@') },
    'Target database');
  if (DRY_RUN) {
    logger.warn('DRY-RUN mode — no writes will happen. Pass --yes to write.');
  } else {
    logger.info('WRITE mode — will encrypt and save plaintext keys.');
  }
  logger.info('-------------------------------------------------------------');

  // Connect
  let conn;
  try {
    conn = await mongoose.createConnection(AIGEEK_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }).asPromise();
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.fatal({ err }, 'Failed to connect to MongoDB — aborting');
    process.exit(1);
  }

  try {
    await migrateCollection(conn, 'AIConfig', 'aiconfigs', 'apiKey');
    // APIKey collection intentionally skipped: it stores only a SHA-256 hash
    // (keyHash), not a recoverable plaintext secret — nothing to encrypt.
    logger.info('APIKey collection skipped (stores hash only, no plaintext secret)');
  } finally {
    await conn.close();
    logger.info('MongoDB connection closed');
  }
}

/**
 * Migrate a single collection.
 * @param {mongoose.Connection} conn
 * @param {string} modelName  Human-readable name for logging
 * @param {string} collectionName  Actual Mongo collection name
 * @param {string} field  The field holding the (possibly plaintext) secret
 */
async function migrateCollection(conn, modelName, collectionName, field) {
  logger.info(`--- ${modelName} (collection: ${collectionName}, field: ${field}) ---`);

  const collection = conn.collection(collectionName);
  const cursor = collection.find({});

  let scanned = 0;
  let encrypted = 0;
  let skipped = 0;
  let empty = 0;

  for await (const doc of cursor) {
    scanned++;
    const value = doc[field];

    if (value == null || value === '') {
      empty++;
      logger.debug({ _id: doc._id, provider: doc.provider ?? '?' },
        `${modelName}: field is null/empty — skipping`);
      continue;
    }

    if (isEncrypted(value)) {
      skipped++;
      logger.debug({ _id: doc._id, provider: doc.provider ?? '?' },
        `${modelName}: already encrypted — skipping`);
      continue;
    }

    // Needs encryption
    const encryptedValue = encrypt(value);
    logger.info(
      { _id: doc._id, provider: doc.provider ?? '?', dryRun: DRY_RUN },
      `${modelName}: encrypting field`
    );

    if (!DRY_RUN) {
      await collection.updateOne(
        { _id: doc._id },
        { $set: { [field]: encryptedValue, updatedAt: new Date() } }
      );
    }
    encrypted++;
  }

  logger.info(
    { scanned, encrypted, skipped, empty, dryRun: DRY_RUN },
    `${modelName}: migration complete`
  );
}

run().catch(err => {
  logger.fatal({ err }, 'Unhandled error in encrypt-keys migration');
  process.exit(1);
});
