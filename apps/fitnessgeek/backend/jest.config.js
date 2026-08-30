// Jest config for fitnessgeek's backend test suite.
//
// This backend is CommonJS (no "type": "module"), so the tests use jest's
// default CommonJS transform and the built-in `jest.mock()` — no
// experimental-vm-modules needed (unlike storygeek's ESM suite).
//
// Scoped to src/__tests__/routes so it never collides with the ad-hoc
// top-level `test-*.js` scripts in this directory, which are hand-run
// integration probes (Redis/FatSecret/Garmin), not jest tests.
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 15000,
  testMatch: ['<rootDir>/src/__tests__/routes/**/*.test.js'],
  moduleFileExtensions: ['js', 'json', 'node'],
  clearMocks: true,
};
