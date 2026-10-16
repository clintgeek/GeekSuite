// The boot log's "Redis caching:" line must describe the connection as it
// turned out, not as it was a microsecond after `listen`. It used to be logged
// in the listen callback, before `redisClient.connect()` had settled, so every
// production boot said "disabled" one line before "connected and ready"
// (REVIEW_2026-10 §2). server.js boots on import, so everything it touches is
// doubled here.
import { describe, test, expect, jest } from '@jest/globals';

const mod = (p) => new URL(p, import.meta.url).pathname;

const lines = [];
const logger = {
  info: jest.fn((...args) => lines.push(['info', args.find((a) => typeof a === 'string')])),
  warn: jest.fn((...args) => lines.push(['warn', args.find((a) => typeof a === 'string')])),
  error: jest.fn(),
  debug: jest.fn()
};

let finishConnect;
let ready = false;
const redisClient = {
  connect: jest.fn(() => new Promise((resolve) => {
    finishConnect = () => { ready = true; resolve({}); };
  })),
  isReady: () => ready,
  quit: jest.fn()
};

let listening;
jest.unstable_mockModule(mod('../config/logger.js'), () => ({ __esModule: true, default: logger }));
jest.unstable_mockModule(mod('../config/redis.js'), () => ({ __esModule: true, default: redisClient }));
jest.unstable_mockModule(mod('../config/database.js'), () => ({ __esModule: true, default: async () => {} }));
jest.unstable_mockModule(mod('../config/keyVault.js'), () => ({ __esModule: true, assertKeyVaultSecret: () => {} }));
jest.unstable_mockModule(mod('../services/bodyCompFolderImportService.js'), () => ({
  __esModule: true,
  startBodyCompFolderImport: () => ({ stop: async () => {} })
}));
jest.unstable_mockModule(mod('../app.js'), () => ({
  __esModule: true,
  default: {
    listen: (_port, _host, cb) => {
      listening = new Promise((r) => setImmediate(() => { cb(); r(); }));
      return {};
    }
  }
}));
jest.unstable_mockModule('@geeksuite/logger', () => ({ __esModule: true, installShutdownHooks: () => {} }));
jest.unstable_mockModule('mongoose', () => ({ __esModule: true, default: { disconnect: async () => {} } }));

const statusLines = () => lines.filter(([, msg]) => /^Redis caching:/.test(msg || '')).map(([, msg]) => msg);

describe('the Redis status line at boot', () => {
  test('waits for the connection to settle, then tells the truth', async () => {
    await import('../server.js');
    await new Promise((r) => setImmediate(r));
    await listening;

    // Listening, Redis still connecting: no verdict yet.
    expect(lines.some(([, msg]) => /server running/.test(msg || ''))).toBe(true);
    expect(statusLines()).toEqual([]);

    finishConnect();
    await new Promise((r) => setImmediate(r));
    expect(statusLines()).toEqual(['Redis caching: enabled']);
  });
});
