// Jest setup for storygeek's ESM test suite.
//
// This project has no live-Mongo test harness (mongodb-memory-server is not
// a dependency here, and adding one is out of scope for this pass — see
// src/__tests__/controllers and src/__tests__/routes for the resulting
// model/controller-level tests, which mock the Story model and auth
// middleware directly instead of hitting a real database or basegeek).

import { jest, afterAll } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.BASEGEEK_URL = 'https://basegeek.invalid';
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
