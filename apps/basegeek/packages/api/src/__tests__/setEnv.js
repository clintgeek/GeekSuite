/**
 * setEnv.js — Jest setupFiles entry.
 *
 * Runs inside each test worker SYNCHRONOUSLY, before any module is imported.
 * Sets all environment variables that module-load-time guards check:
 *   - authService.js  → JWT_SECRET, JWT_REFRESH_SECRET (≥32 chars)
 *   - cryptoVault.js  → KEY_VAULT_SECRET (64 hex chars = 32 bytes)
 *   - user.js         → USERGEEK_MONGODB_URI (points at in-memory Mongo)
 *   - database.js     → AIGEEK_MONGODB_URI
 *
 * The in-memory Mongo URI was written by globalSetup to a JSON sidecar;
 * we read it here with readFileSync (synchronous — safe in setupFiles).
 */

import { readFileSync } from 'fs';

// ── Auth secrets ─────────────────────────────────────────────────────────────
// Must be set before authService.js or cryptoVault.js are imported.
process.env.JWT_SECRET          = 'test-jwt-secret-at-least-32-chars!!';
process.env.JWT_REFRESH_SECRET  = 'test-refresh-secret-at-least-32chars!';
// AES key — exactly 64 lowercase hex chars (32 bytes)
process.env.KEY_VAULT_SECRET    = 'a'.repeat(64);

// ── Environment ───────────────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';

// ── MongoDB URIs ──────────────────────────────────────────────────────────────
// Read from the run-unique sidecar written by globalSetup so every model file
// that creates a Mongoose connection at import-time points at THIS run's
// in-memory DB (concurrent jest runs each get their own mongod). The path
// arrives via env (workers inherit the main process env at spawn); the ppid
// fallback covers pools where env propagation differs.
const stateFileCandidates = [
  process.env.JEST_MONGOD_STATE_FILE,
  `/tmp/__jest_mongod_state__.${process.ppid}.json`,
].filter(Boolean);

let mongoUri = 'mongodb://localhost:27017/testdb'; // fallback (shouldn't be needed)
for (const candidate of stateFileCandidates) {
  try {
    const raw = readFileSync(candidate, 'utf8');
    mongoUri = JSON.parse(raw).uri;
    break;
  } catch {
    // Try the next candidate; globalSetup may not have run at all when a
    // single test file is executed manually — the fallback URI is acceptable
    // for isolated unit tests that don't need Mongo.
  }
}

process.env.MONGODB_URI          = mongoUri;
process.env.USERGEEK_MONGODB_URI = mongoUri;
process.env.AIGEEK_MONGODB_URI   = mongoUri;
process.env.MONGODB_TEST_URI     = mongoUri;

// Per-app connections (graphql/shared/appConnections.js) are built as
// `${MONGO_BASE_URI}/<dbName>?authSource=admin`, so hand it the host portion
// of the in-memory URI (no trailing path/slash).
process.env.MONGO_BASE_URI =
  (mongoUri.match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)/)?.[1]) || mongoUri;

// ── Redis URL ─────────────────────────────────────────────────────────────────
// The real redis client is mocked per-test-file via jest.unstable_mockModule.
// This env var satisfies any code that reads it before the mock fires.
process.env.REDIS_URL = 'redis://localhost:6379';
