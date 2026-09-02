export default {
  testEnvironment: 'node',
  transform: {},
  setupFilesAfterEnv: ['./jest.setup.js'],
  testTimeout: 30000,
  testMatch: [
    '<rootDir>/src/__tests__/**/*.test.js',
  ],
  moduleFileExtensions: ['js', 'json', 'node'],
};
