/**
 * importLock.js — the mutex the upload route (playniteRoutes.js) and the
 * Nextcloud drop watcher (dropWatcher.js) both import from, so an upload and
 * a folder-drop import can never commit at the same time
 * (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { withImportLock } from '../src/playnite/importLock.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('withImportLock', () => {
  test('a second call waits for the first to fully settle', async () => {
    const events = [];
    const first = withImportLock(async () => {
      events.push('first:start');
      await wait(20);
      events.push('first:end');
      return 'first';
    });
    // Queued immediately, before `first` has resolved — must still wait.
    const second = withImportLock(async () => {
      events.push('second:start');
      return 'second';
    });

    assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
    assert.deepEqual(events, ['first:start', 'first:end', 'second:start']);
  });

  test('a failed call surfaces its own rejection but does not wedge the queue', async () => {
    const boom = withImportLock(async () => {
      throw new Error('commit blew up');
    });
    await assert.rejects(boom, /commit blew up/);

    const after = await withImportLock(async () => 'still works');
    assert.equal(after, 'still works');
  });

  test('three overlapping callers run strictly one at a time, in queue order', async () => {
    let running = 0;
    let maxConcurrent = 0;
    const order = [];
    const task = (id, ms) => withImportLock(async () => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await wait(ms);
      order.push(id);
      running -= 1;
    });

    await Promise.all([task('a', 15), task('b', 5), task('c', 1)]);
    assert.equal(maxConcurrent, 1);
    assert.deepEqual(order, ['a', 'b', 'c']);
  });
});
