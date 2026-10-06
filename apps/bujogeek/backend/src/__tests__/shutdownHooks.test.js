// Wiring guard: server.js boots on import (Mongo, listen), so it cannot be
// loaded in a unit test. This reads the source and pins that graceful shutdown
// goes through @geeksuite/logger's installShutdownHooks — no bespoke
// SIGTERM/SIGINT handler — and that onClose still runs every cleanup the old
// handler did. The hook itself is tested in packages/logger.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../../server.js', import.meta.url)), 'utf8');
const onClose = src.slice(src.indexOf('installShutdownHooks('));

test('server.js installs the shared shutdown hooks', () => {
  expect(src).toMatch(/installShutdownHooks\(logger, server, \{/);
  expect(src).not.toMatch(/process\.on\(['"](SIGTERM|SIGINT)['"]/);
});

test('onClose runs every cleanup the old handler did', () => {
  expect(onClose).toContain('mongoose.disconnect');
});
