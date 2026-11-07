/**
 * Jest configuration for @datageek/api
 *
 * ESM-first: the project is "type": "module" so we use
 * --experimental-vm-modules (already set in the test script).
 */

export default {
  // Use the Node test environment (no jsdom)
  testEnvironment: 'node',

  // Single shared in-memory MongoDB per run; parallel workers clobber each
  // other's test data. Run suites sequentially.
  maxWorkers: 1,

  // Under --experimental-vm-modules every test file re-links the whole ESM
  // graph and the old one is never fully released: ~25 MB per file, in the
  // newsgeek/thinggeek suites ~120 MB. In band, 179 files reached Node's
  // ~4 GB heap ceiling and the run died (2026-11-06). With a limit set, Jest
  // runs the one worker out of process and replaces it once it has grown
  // past this, so the peak stays bounded however many suites are added.
  // Measured on the full run: peak RSS 1.3 GB at 512MB (2.2 GB at 1GB), and
  // 205 s against 301 s in band — re-linking a fresh worker is cheaper than
  // collecting a 4 GB heap.
  // `--runInBand` on the command line overrides this and brings the
  // unbounded growth back.
  workerIdleMemoryLimit: '512MB',

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
