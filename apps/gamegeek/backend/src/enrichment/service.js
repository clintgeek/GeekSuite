/**
 * Wires the enrichment engine to the real world: the Game model, the live
 * providers, the cover pipeline, and the triggers
 * (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Running it).
 *
 * Env:
 *   ENRICHMENT_DISABLED=1  kill switch — nothing runs, run endpoint answers started:false.
 *   ENRICHMENT_AUTORUN=1   fire the automatic triggers (boot, 6 h, after an
 *                          import) outside production. In production
 *                          (NODE_ENV=production) they are on by default, so
 *                          tests and `npm run dev` never start the worker on
 *                          their own. The run endpoint works either way.
 */
import fs from 'node:fs';
import Game from '../models/Game.js';
import logger from '../lib/logger.js';
import { fetchImageBuffer } from '../lib/coverFetch.js';
import { sniffCoverImage } from '../lib/imageSniff.js';
import { resolveCoverPath, ensureCoversDir, deleteCoverFileQuiet } from '../lib/coverStorage.js';
import { COVER_HOSTS } from '../metadata/coverHosts.js';
import { createProviders } from './providers.js';
import { createWorker } from './worker.js';

export const BOOT_DELAY_MS = 30_000;
export const INTERVAL_MS = 6 * 60 * 60 * 1000;

const truthy = (v) => ['1', 'true', 'yes', 'on'].includes(String(v ?? '').trim().toLowerCase());

export function isEnrichmentDisabled(env = process.env) {
  return truthy(env.ENRICHMENT_DISABLED);
}

export function isAutorunEnabled(env = process.env) {
  return !isEnrichmentDisabled(env) && (env.NODE_ENV === 'production' || truthy(env.ENRICHMENT_AUTORUN));
}

/** Download the first cover URL that yields a real image (allow-listed hosts only). */
export async function fetchCover(urls, { fetchImpl, log = logger } = {}) {
  for (const url of urls ?? []) {
    const buffer = await fetchImageBuffer(url, { allowedHosts: COVER_HOSTS, fetchImpl, logger: log });
    if (!buffer) continue;
    const sniffed = sniffCoverImage(buffer);
    if (sniffed) return { buffer, ext: sniffed.ext };
  }
  return null;
}

export function writeCover(gameId, ext, buffer) {
  ensureCoversDir();
  fs.writeFileSync(resolveCoverPath(gameId, ext), buffer);
  return `${gameId}.${ext}`;
}

export function deleteCover(filename) {
  const [id, ext] = String(filename).split('.');
  deleteCoverFileQuiet(resolveCoverPath(id, ext));
}

let deps = null;
let worker = null;

/** The real dependency bundle enrichGame()/the routes use. */
export function getEnrichmentDeps() {
  if (!deps) {
    deps = {
      Game,
      providers: createProviders({ logger }),
      fetchCover: (urls) => fetchCover(urls),
      writeCover,
      deleteCover,
      logger,
      isDisabled: () => isEnrichmentDisabled(),
    };
  }
  return deps;
}

/** The process-wide worker singleton. */
export function getEnrichmentWorker() {
  if (!worker) worker = createWorker(getEnrichmentDeps());
  return worker;
}

/** Non-blocking automatic trigger (e.g. after a Playnite commit). Returns whether it fired. */
export function triggerEnrichment(trigger, { env = process.env } = {}) {
  if (!isAutorunEnabled(env)) return false;
  setImmediate(() => {
    try {
      getEnrichmentWorker().run({ trigger });
    } catch (err) {
      logger.error({ err: err?.message }, 'enrichment trigger failed');
    }
  });
  return true;
}

/** Boot run after BOOT_DELAY_MS, then every INTERVAL_MS. Both timers are unref'd. */
export function startEnrichmentSchedule({ env = process.env, bootDelayMs = BOOT_DELAY_MS, intervalMs = INTERVAL_MS } = {}) {
  if (!isAutorunEnabled(env)) {
    logger.info(
      { disabled: isEnrichmentDisabled(env) },
      'metadata enrichment: automatic runs off (NODE_ENV!=production and no ENRICHMENT_AUTORUN, or ENRICHMENT_DISABLED)'
    );
    return null;
  }
  const boot = setTimeout(() => getEnrichmentWorker().run({ trigger: 'boot' }), bootDelayMs);
  boot.unref?.();
  const every = setInterval(() => getEnrichmentWorker().run({ trigger: 'interval' }), intervalMs);
  every.unref?.();
  return {
    stop() {
      clearTimeout(boot);
      clearInterval(every);
    },
  };
}

export default {
  isEnrichmentDisabled,
  isAutorunEnabled,
  getEnrichmentDeps,
  getEnrichmentWorker,
  triggerEnrichment,
  startEnrichmentSchedule,
};
