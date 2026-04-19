/**
 * Jest configuration for @datageek/api
 *
 * ESM-first: the project is "type": "module" so we use
 * --experimental-vm-modules (already set in the test script).
 */

export default {
  // Use the Node test environment (no jsdom)
  testEnvironment: 'node',

  // Discover tests only inside src/__tests__/
  testMatch: ['**/src/__tests__/**/*.test.js'],

  // globalSetup runs ONCE before all test suites, in a Node worker.
  // We use it to start MongoMemoryServer and write the URI into process.env
  // so that setupFiles can pick it up (Jest propagates env changes from
  // globalSetup into every test worker automatically).
  globalSetup: './src/__tests__/globalSetup.js',
  globalTeardown: './src/__tests__/globalTeardown.js',

  // setupFiles: runs inside each test worker BEFORE the test module is
  // imported — ideal for setting env vars that module-load-time guards read.
  setupFiles: ['./src/__tests__/setEnv.js'],

  // Tell Jest not to transform anything (leave ESM as-is, handled by
  // --experimental-vm-modules).
  transform: {},
};
