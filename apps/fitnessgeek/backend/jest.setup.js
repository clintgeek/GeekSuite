// Jest setup for fitnessgeek's backend suite.
//
// These tests are hermetic: the Mongoose models, the auth middleware (which
// otherwise validates tokens against basegeek), and the Redis-backed cache
// service are all replaced by jest mocks in each test file. There is no live
// Mongo, no Redis, and no network to basegeek — mongodb-memory-server is not a
// dependency here and adding one is out of scope for this first pass.

process.env.NODE_ENV = 'test';
process.env.BASEGEEK_URL = 'https://basegeek.invalid';

// Surface unhandled rejections during the run instead of swallowing them,
// without crashing the process (jest handles reporting).
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled Rejection in test run:', reason);
});

afterAll(() => {
  jest.restoreAllMocks();
});
