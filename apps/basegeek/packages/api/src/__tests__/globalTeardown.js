/**
 * Jest globalTeardown — runs ONCE after all test suites.
 * Stops the MongoMemoryServer started in globalSetup.
 */

import { unlinkSync } from 'fs';

export default async function globalTeardown() {
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
  }
  if (global.__MONGOD_STATE_FILE__) {
    try { unlinkSync(global.__MONGOD_STATE_FILE__); } catch { /* already gone */ }
  }
}
