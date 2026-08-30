// Jest setup for flockgeek's native-ESM test suite.
//
// This is the first test harness added to this backend. There is no
// mongodb-memory-server dependency and adding one is out of scope for this
// pass — see src/__tests__/routes for the resulting route/controller-level
// tests, which mock the Mongoose models and auth middleware directly instead
// of hitting a real database or basegeek.

import { jest, afterAll } from '@jest/globals';

process.env.NODE_ENV = 'test';

// Fail loudly instead of silently swallowing unhandled rejections during
// tests, but don't crash the process (jest handles reporting).
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled Rejection in test run:', reason);
});

afterAll(() => {
  jest.restoreAllMocks();
});
