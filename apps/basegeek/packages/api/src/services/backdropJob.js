/**
 * backdropJob.js — keeps a fresh batch of wallpapers on hand
 * (DOCS/BACKDROP_SERVICE_PLAN.md).
 *
 * StartGeek used to hot-link picsum.photos on every page load, so when Picsum
 * went down (2026-11-13: 522 for hours) the wallpaper simply vanished. Now
 * basegeek downloads a small mixed batch from several public sources and
 * serves it from our own origin (routes/backdrops.js).
 *
 * Shape follows aiCatalogJob.js: a class with start()/stop(), an hourly
 * setInterval tick, started after listen in server.js and stopped on
 * shutdown. Each tick refreshes when the last batch that actually replaced
 * the previous one is older than BACKDROP_REFRESH_HOURS (48), or when there
 * is no batch at all. A failed attempt leaves the old batch in place and the
 * next hourly tick tries again.
 *
 * The rules that matter:
 *   - Sources are interleaved (bing, picsum, loremflickr, bing, …), so a batch
 *     is mixed, and a dead source's share is made up by the others.
 *   - A refresh that keeps fewer than MIN_KEEP photos does NOT replace the
 *     current batch. A thin outage day never downgrades a good batch.
 *   - The new batch is fully written before the old one is deleted, so a
 *     reader never sees an empty or half-written set.
 *   - Every attempt writes a BackdropRun, even a failed one.
 *
 * `BACKDROP_JOB=off` disables it. Clock, sources, downloader and collections
 * are injectable so the schedule and the batch rules test without a network.
 */

import crypto from 'node:crypto';
import logger from '../lib/logger.js';
import Backdrop from '../models/Backdrop.js';
import BackdropRun from '../models/BackdropRun.js';
import { SOURCES, downloadImage } from './backdropSources.js';

const HOUR = 60 * 60 * 1000;
export const DEFAULT_TICK_MS = HOUR;
export const DEFAULT_REFRESH_HOURS = 48;
export const DEFAULT_BOOT_DELAY_MS = 30_000;
export const TARGET = 10;
export const MIN_KEEP = 4;

/** [[a0,a1],[b0],[c0,c1,c2]] → [a0,b0,c0,a1,c1,c2] */
export function interleave(lists) {
  const out = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

export class BackdropJob {
  constructor({
    now = () => Date.now(),
    sources = SOURCES,
    download = downloadImage,
    Photos = Backdrop,
    Runs = BackdropRun,
    refreshHours = Number(process.env.BACKDROP_REFRESH_HOURS) || DEFAULT_REFRESH_HOURS,
    tickMs = DEFAULT_TICK_MS,
    bootDelayMs = DEFAULT_BOOT_DELAY_MS,
    target = TARGET,
    minKeep = MIN_KEEP,
    log = logger,
  } = {}) {
    Object.assign(this, { now, sources, download, Photos, Runs, refreshHours, tickMs, bootDelayMs, target, minKeep, log });
    this.timer = null;
    this.bootTimer = null;
    this.running = false;
  }

  /** True when there is no batch, or the last batch that landed is too old. */
  async isDue() {
    const [last, count] = await Promise.all([
      this.Runs.findOne({ replaced: true }).sort({ startedAt: -1 }).lean(),
      this.Photos.countDocuments({}),
    ]);
    if (!last || count === 0) return true;
    return this.now() - new Date(last.startedAt).getTime() >= this.refreshHours * HOUR;
  }

  async tick() {
    if (this.running) return null;
    this.running = true;
    try {
      if (!(await this.isDue())) return null;
      return await this.refresh();
    } catch (err) {
      this.log.error({ err }, '[BackdropJob] tick failed');
      return null;
    } finally {
      this.running = false;
    }
  }

  /** Fetch a new batch; replace the current one only if it's good enough. */
  async refresh() {
    const startedAt = new Date(this.now());
    const batchId = `${startedAt.toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString('hex')}`;
    const perSource = {};
    const run = { startedAt, batchId, kept: 0, replaced: false, perSource, error: null };

    try {
      const lists = await Promise.all(this.sources.map(async (src) => {
        perSource[src.id] = { tried: 0, kept: 0, error: null };
        try {
          return await src.candidates(this.target);
        } catch (err) {
          perSource[src.id].error = `candidates: ${err.message}`;
          return [];
        }
      }));

      const seen = new Set();
      const photos = [];
      for (const c of interleave(lists)) {
        if (photos.length >= this.target) break;
        const key = `${c.source}:${c.sourceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const stat = perSource[c.source] || (perSource[c.source] = { tried: 0, kept: 0, error: null });
        stat.tried++;
        try {
          const landscape = await this.download(c.urls.landscape);
          const portrait = await this.download(c.urls.portrait);
          photos.push({
            batchId,
            source: c.source,
            sourceId: c.sourceId,
            credit: c.credit,
            landscape: { ...landscape, bytes: landscape.data.length },
            portrait: { ...portrait, bytes: portrait.data.length },
            createdAt: startedAt,
          });
          stat.kept++;
        } catch (err) {
          stat.error = err.message; // last error per source is enough to read a run
        }
      }

      run.kept = photos.length;
      if (photos.length < this.minKeep) {
        run.error = `only ${photos.length} photo(s) downloaded (need ${this.minKeep}); kept the current batch`;
        this.log.warn({ perSource }, `[BackdropJob] ${run.error}`);
      } else {
        await this.Photos.insertMany(photos);
        await this.Photos.deleteMany({ batchId: { $ne: batchId } });
        run.replaced = true;
        this.log.info({ batchId, kept: photos.length, perSource }, '[BackdropJob] new batch');
      }
    } catch (err) {
      run.error = err.message;
      this.log.error({ err }, '[BackdropJob] refresh failed');
    }

    run.finishedAt = new Date(this.now());
    try {
      await this.Runs.create(run);
    } catch (err) {
      this.log.error({ err }, '[BackdropJob] could not record run');
    }
    return run;
  }

  start() {
    if (this.timer || this.bootTimer) return;
    this.bootTimer = setTimeout(() => {
      this.bootTimer = null;
      this.tick();
      this.timer = setInterval(() => this.tick(), this.tickMs);
      this.timer.unref?.();
    }, this.bootDelayMs);
    this.bootTimer.unref?.();
  }

  stop() {
    clearTimeout(this.bootTimer);
    clearInterval(this.timer);
    this.bootTimer = null;
    this.timer = null;
  }
}

let job = null;

export function startBackdropJob() {
  if (process.env.BACKDROP_JOB === 'off') {
    logger.info('[BackdropJob] disabled (BACKDROP_JOB=off)');
    return;
  }
  job = new BackdropJob();
  job.start();
  logger.info('[BackdropJob] started');
}

export function stopBackdropJob() {
  job?.stop();
  job = null;
}
