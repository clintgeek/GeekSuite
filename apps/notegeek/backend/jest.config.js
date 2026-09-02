export default {
    testEnvironment: 'node',
    transform: {},
    setupFilesAfterEnv: ['./jest.setup.js'],
    testTimeout: 30000,
    testMatch: ['**/__tests__/**/*.test.js'],
    testPathIgnorePatterns: ['/node_modules/', '/utils/', '/models/'],
    moduleFileExtensions: ['js', 'json', 'node']
};