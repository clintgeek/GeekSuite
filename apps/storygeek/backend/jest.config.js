export default {
  testEnvironment: 'node',
  transform: {},
  setupFilesAfterEnv: ['./jest.setup.js'],
  testTimeout: 30000,
  // Only pick up the jest-based suites. The pre-existing __tests__/*.test.js
  // files at the top level use node's built-in test runner (`node --test`)
  // and are intentionally excluded here — they're run by a separate script.
  testMatch: [
    '<rootDir>/src/__tests__/controllers/**/*.test.js',
    '<rootDir>/src/__tests__/routes/**/*.test.js',
  ],
  moduleFileExtensions: ['js', 'json', 'node'],
};
