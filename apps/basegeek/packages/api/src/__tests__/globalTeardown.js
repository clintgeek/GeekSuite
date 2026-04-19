/**
 * Jest globalTeardown — runs ONCE after all test suites.
 * Stops the MongoMemoryServer started in globalSetup.
 */

export default async function globalTeardown() {
  if (global.__MONGOD__) {
    await global.__MONGOD__.stop();
  }
}
