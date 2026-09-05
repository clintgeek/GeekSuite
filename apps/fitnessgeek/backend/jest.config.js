// Jest config for fitnessgeek's backend test suite.
//
// This backend is native ESM ("type": "module"), so the suite runs on jest's
// ESM support: `node --experimental-vm-modules node_modules/jest/bin/jest.js`
// (see the `test` script in package.json) with an empty `transform` so no
// babel step rewrites the modules back to CommonJS. This is the same shape
// bujogeek, notegeek, flockgeek and storygeek already use.
//
// Consequences for the test files themselves:
//   - `jest`, `describe`, `it`/`test` and `expect` come from `@jest/globals`.
//   - Module doubles use `jest.unstable_mockModule()` (which must run BEFORE
//     the module under test is imported) plus an `await import()` for the
//     subject, rather than `jest.mock()` + a hoisted `require()`.
//   - Specifiers carry their `.js` extension, as ESM requires.
//
// Scoped to src/__tests__ so it never collides with the ad-hoc top-level
// `test-*.js` scripts in this directory, which are hand-run integration
// probes (Redis/FatSecret/Garmin), not jest tests.
export default {
  testEnvironment: 'node',
  transform: {},
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 15000,
  testMatch: ['<rootDir>/src/__tests__/**/*.test.js'],
  moduleFileExtensions: ['js', 'json', 'node'],
  clearMocks: true,
};
