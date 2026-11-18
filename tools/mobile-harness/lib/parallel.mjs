// Walks an app's viewports side by side instead of one after another.
//
// A scene spends most of its time waiting (network idle, then a settle), so
// four contexts in a row is four times the wall clock for no reason: the
// 2026-11-17 FitnessGeek shard took 19.5 minutes for 57 scenes x 4 contexts.
//
// Each viewport gets its own worker THREAD, and so its own Chromium and its
// own copy of the app's fixtures. That last part is the point: fixtures keep
// module-level state (ThingGeek's WORLD, TodoGeek's task counter, saved
// filters) that one viewport's scenes mutate, and a thread has its own module
// graph, so viewports cannot see each other's writes — exactly as when they
// ran in sequence, each from a fresh `fixtures.routes`.
import { Worker } from 'node:worker_threads';
import { runApp } from './runner.mjs';

const WORKER = new URL('./viewport-worker.mjs', import.meta.url);

function runViewport(opts, key) {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER, { workerData: { ...opts, viewports: [key], browser: null } });
    let settled = false;
    const done = (results) => {
      if (settled) return;
      settled = true;
      resolve(results);
    };
    // A worker that dies is a failed viewport, never a silently missing one.
    const failed = (message) => done([{ viewport: key, scene: '(worker)', error: message, open: [], waived: [] }]);
    worker.on('message', (m) => (m.ok ? done(m.results) : failed(m.message)));
    worker.on('error', (err) => failed(String(err?.message || err)));
    worker.on('exit', (code) => failed(`viewport worker exited (${code}) without a result`));
  });
}

/**
 * `runApp`, with up to `jobs` viewports at once. Results come back in the
 * order the viewports were asked for, so SUMMARY.md reads the same either way.
 * `jobs <= 1` (or a single viewport) is the old in-process walk.
 */
export async function runAppParallel({ jobs = 1, browser = null, ...opts }) {
  const keys = opts.viewports;
  if (jobs <= 1 || keys.length <= 1) return runApp({ ...opts, browser });
  const perViewport = new Array(keys.length);
  let next = 0;
  const lane = async () => {
    while (next < keys.length) {
      const i = next++;
      perViewport[i] = await runViewport(opts, keys[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, keys.length) }, lane));
  return { app: opts.app, base: opts.base, results: perViewport.flat() };
}
