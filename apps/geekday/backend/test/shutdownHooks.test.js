import { test } from 'node:test';
import assert from 'node:assert/strict';
// Wiring guard: server.js binds a port on import, so it cannot be loaded in
// a unit test. This pins that graceful shutdown goes through
// @geeksuite/logger's installShutdownHooks (no bespoke signal handler) and
// that the listen defaults match the container (PORT 1840, 0.0.0.0).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../server.js', import.meta.url)), 'utf8');

test('server.js installs the shared shutdown hooks', () => {
  assert.match(src, /installShutdownHooks\(logger, server/);
  assert.doesNotMatch(src, /process\.on\(['"](SIGTERM|SIGINT)['"]/);
});

test('server.js listens on PORT || 1840 at 0.0.0.0', () => {
  assert.match(src, /Number\(process\.env\.PORT\) \|\| 1840/);
  assert.match(src, /listen\(PORT, '0\.0\.0\.0'/);
});
