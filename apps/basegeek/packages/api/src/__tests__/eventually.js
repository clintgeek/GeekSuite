/**
 * eventually.js — waiting for a write this codebase deliberately does not await.
 *
 * Several paths book their bookkeeping fire-and-forget, on purpose:
 * `markFreeTierSuccess` and `markFreeTierFailure` update `AIFreeTier.health`,
 * `recordStickyPick` writes `AIStickyPick`, `updateStats` books the spend
 * ledger. None of them is awaited, because a user must never wait on
 * accounting — and every one of them is something a test then wants to assert.
 *
 * The tempting way to bridge that is `await new Promise(r => setImmediate(r))`,
 * and it is wrong. It waits one macrotask tick, which is a guess about how long
 * a Mongo round-trip takes; the guess usually holds when a file runs alone and
 * loses when ninety other suites are contending for the same in-memory server.
 * That is exactly how `aiFreeTierRouting`'s "resets the counters in the mirror
 * and in Mongo" failed once in a full run on 2026-09-16 and passed on every
 * re-run — the worst kind of red, because it teaches people to re-run rather
 * than to look.
 *
 * So: poll for the condition, with a real budget. `eventually` returns as soon
 * as the read is truthy, so the common case costs one read and no delay.
 *
 * No dependencies and no mocking constraints, unlike `testHelpers.js` — import
 * it from anywhere.
 */

/** Longest we will wait for a detached write, and the gap between reads. */
export const EVENTUALLY_TIMEOUT_MS = 2000;
export const EVENTUALLY_INTERVAL_MS = 25;

/**
 * Read until the value is truthy, or give up.
 *
 * @param {() => Promise<T>|T} read  the query; truthy means "it landed"
 * @param {{timeoutMs?: number, intervalMs?: number, what?: string}} [options]
 *        `what` names the thing in the failure message, so a timeout reads as
 *        "the sticky pick never landed" rather than "expected null".
 * @returns {Promise<T>}
 * @throws if nothing truthy arrives inside the budget
 */
export async function eventually(read, options = {}) {
  const {
    timeoutMs = EVENTUALLY_TIMEOUT_MS,
    intervalMs = EVENTUALLY_INTERVAL_MS,
    what = 'the expected write'
  } = options;

  const deadline = Date.now() + timeoutMs;
  let last;
  for (;;) {
    last = await read();
    if (last) return last;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`eventually: ${what} did not land within ${timeoutMs}ms`);
}

/**
 * Give a detached write a fair chance to happen, then let the caller assert it
 * did NOT.
 *
 * Polling cannot prove an absence — it would return on the first read and prove
 * nothing — so this is the one case where waiting a fixed period is the correct
 * shape rather than a guess. It is deliberately much longer than a macrotask
 * tick, which is what "assert nothing was written" was previously resting on.
 */
export async function settle(ms = 250) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export default { eventually, settle, EVENTUALLY_TIMEOUT_MS };
