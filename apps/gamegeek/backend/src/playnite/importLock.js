/**
 * A process-wide serialization point for Playnite commits. The upload route
 * (playniteRoutes.js) and the Nextcloud drop watcher (dropWatcher.js) both
 * write games/copies/player rows for a household; without this, an upload
 * landing mid-drop-import (or two drop files racing across users) could
 * interleave two commits' bulkWrites against the same household. Not a real
 * distributed lock — one Node process is all there is here, which is all
 * this needs to cover.
 */
let queue = Promise.resolve();

/**
 * Run `fn` once every previously-queued call has settled. The caller's own
 * promise still rejects on `fn`'s error; only the shared queue swallows it,
 * so one failed import never wedges the next one.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function withImportLock(fn) {
  const result = queue.then(() => fn());
  queue = result.then(
    () => {},
    () => {},
  );
  return result;
}

export default { withImportLock };
