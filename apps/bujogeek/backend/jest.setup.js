// Jest setup for bujogeek's native-ESM auth-isolation test suite.
//
// bujogeek's backend does not verify JWTs locally — it delegates identity
// checks to basegeek via @geeksuite/user's attachUser()/validateToken(),
// which calls GET {BASEGEEK_URL}/api/users/me. There is no local JWT_SECRET
// verification in this backend, so these are just stable, harmless test
// values (never read from a real .env file).

import { jest, afterAll } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.BASEGEEK_URL = 'https://basegeek.test';
process.env.APP_NAME = 'bujogeek';
process.env.JWT_SECRET = 'test-jwt-secret-not-used-for-local-verification';
// Quiet pino-http's per-request logging in test output (logger.js reads
// LOG_LEVEL; 'silent' is a real pino level, not a hack).
process.env.LOG_LEVEL = 'silent';

// Fail loudly instead of silently swallowing unhandled rejections during
// tests, but don't crash the process (jest handles reporting).
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled Rejection in test run:', reason);
});

afterAll(() => {
  jest.restoreAllMocks();
});
