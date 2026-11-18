// One viewport of one app, in its own thread. See parallel.mjs.
import { parentPort, workerData } from 'node:worker_threads';
import { runApp } from './runner.mjs';

try {
  const run = await runApp(workerData);
  parentPort.postMessage({ ok: true, results: run.results });
} catch (err) {
  parentPort.postMessage({ ok: false, message: String(err?.stack || err?.message || err) });
}
