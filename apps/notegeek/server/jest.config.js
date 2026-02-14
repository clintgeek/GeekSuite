export default {
    testEnvironment: 'node',
    transform: {
        '^.+\\.js$': 'babel-jest'
    },
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1'
    },
    setupFilesAfterEnv: ['./jest.setup.js'],
    testTimeout: 30000,
    testMatch: ['**/__tests__/**/*.test.js'],
    testPathIgnorePatterns: ['/node_modules/', '/utils/'],
    moduleFileExtensions: ['js', 'json', 'node'],
    transformIgnorePatterns: [
        'node_modules/(?!(mongoose)/)'
    ],
    globals: {
        'ts-jest': {
            useESM: true
        }
    }
};