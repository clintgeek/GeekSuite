/**
 * The story assigner — in-process, started by server.js beside the ingest
 * worker and the embedding indexer. N1 clustering, phase 2
 * (apps/newsgeek/DOCS/CLUSTERING.md). The rule itself is cluster/stories.js.
 *
 * Every TICK_MS (60 s), single-flight, until TICK_BUDGET_MS is spent or the
 * queue is empty:
 *   1. read up to BATCH_SIZE articles that have a vector for the CURRENT
 *      model and no story, published in the last ASSIGN_DAYS, OLDEST first
 *      (a story forms in the order its coverage appeared);
 *   2. load the stories still open to that batch (lastArticleAt within the
 *      72 h window before the batch's oldest article), once per pass;
 *   3. each article joins a story or starts one (assignBatch);
 *   4. write the changed stories, THEN `$set storyId` on the articles.
 *
 * The queue IS the database ("has a vector, has no story"), so a restart
 * (every main push) loses nothing. Cut off between the two writes, a batch is
 * simply assigned again: its articles find the stories they already made
 * (same title key → a copy, which adds no voice), so nothing is doubled but
 * `articleCount`, which nothing reads for ranking.
 *
 * Articles older than ASSIGN_DAYS never get a story: the front page looks
 * back 10 days at most, and an unassigned article still shows on its own.
 *
 * It needs no outside service: vectors come from the embedding indexer. An
 * article waits here until it has one. Ingest and the indexer never notice
 * this loop: no shared timers, no shared state.
 *
 * Production only (or STORIES_AUTORUN=1); STORIES_DISABLED=1 is the kill
 * switch — the same shape as INGEST_*, EMBED_* and PURGE_*.
 */
import mongoose from 'mongoose';
import { singleFlight } from '../lib/concurrency.js';
import { embeddingsConfig } from '../cluster/embeddings.js';
import { assignBatch, WINDOW_MS } from '../cluster/stories.js';

export const TICK_MS = 60_000;
export const BATCH_SIZE = 400;
export const TICK_BUDGET_MS = 20_000;
export const ASSIGN_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Articles waiting for a story: a vector for `model`, no story, recent enough. */
export function queueFilter(model, since) {
  return { storyId: null, publishedAt: { $gte: since }, 'embedding.model': model, 'embedding.vector.0': { $exists: true } };
}

/** A stored story as the clusterer holds it (cluster/stories.js newStory). */
function hydrate(doc) {
  const sum = Float64Array.from(doc.sum || []);
  let sq = 0;
  for (let i = 0; i < sum.length; i += 1) sq += sum[i] * sum[i];
  return {
    id: doc._id,
    title: doc.title || '',
    sum,
    norm: Math.sqrt(sq) || 1,
    // A story of one article stores no seed: its seed IS its sum.
    seed: Float64Array.from(doc.seed?.length ? doc.seed : doc.sum || []),
    seedStored: Boolean(doc.seed?.length),
    articleCount: doc.articleCount || 1,
    outlets: [...(doc.outlets || [])],
    titleKeys: [...(doc.titleKeys || [])],
    firstArticleAt: new Date(doc.firstArticleAt).getTime(),
    lastArticleAt: new Date(doc.lastArticleAt).getTime(),
    solo: Boolean(doc.solo),
    dirty: false,
    created: false,
  };
}

function storyWrite(story, model) {
  const fields = {
    title: String(story.title || '').slice(0, 500),
    model,
    articleCount: story.articleCount,
    outlets: story.outlets,
    titleKeys: story.titleKeys,
    firstArticleAt: new Date(story.firstArticleAt),
    lastArticleAt: new Date(story.lastArticleAt),
    solo: story.solo,
  };
  // A solo story is never compared with anything: it keeps no vectors.
  if (!story.solo) {
    fields.sum = Array.from(story.sum);
    // The seed is written once, when a second article joins (about four
    // stories in five never get one, and their seed is their sum).
    if (!story.seedStored && story.articleCount > 1) fields.seed = Array.from(story.seed);
  }
  return { updateOne: { filter: { _id: story.id }, update: { $set: fields }, upsert: true } };
}

/**
 * Build the assigner. `tick()` runs one pass (tests call it directly);
 * `start()` schedules it; `status()` feeds /api/health.
 *
 * @param {object} args
 * @param {{ Article, Story, Source }} args.models
 * @param {() => string} [args.currentModel]  default: EMBEDDINGS_MODEL or mxbai
 * @param {object} [args.options]  { join, seedFloor, windowMs, maxSpanMs } for tests
 */
export function createStoryAssigner({
  models,
  currentModel = () => embeddingsConfig().model,
  batchSize = BATCH_SIZE,
  tickBudgetMs = TICK_BUDGET_MS,
  assignDays = ASSIGN_DAYS,
  options,
  now = () => new Date(),
  clock = () => Date.now(),
  log,
} = {}) {
  const { Article, Story, Source } = models;
  const state = {
    enabled: false,
    running: false,
    lastRunAt: null,
    lastRunAssigned: null,
    lastRunJoined: null,
    pending: null,
    lastError: null,
  };
  let stopping = false;
  let current = null;

  async function pass() {
    const model = currentModel();
    const since = new Date(now().getTime() - assignDays * DAY_MS);
    const filter = queueFilter(model, since);
    const started = clock();
    const windowMs = options?.windowMs ?? WINDOW_MS;

    let officialIds = null;      // loaded with the first batch
    const stories = [];          // the open set, kept for the whole pass
    const known = new Set();
    let loadedFrom = Infinity;   // `stories` holds every story whose lastArticleAt ≥ this
    let assigned = 0;
    let joined = 0;
    let batches = 0;

    while (!stopping) {
      const rows = await Article.find(filter, {
        title: 1, excerpt: 1, titleKey: 1, publisher: 1, publisherDomain: 1, sourceId: 1, publishedAt: 1, 'embedding.vector': 1,
      }).sort({ publishedAt: 1, _id: 1 }).limit(batchSize).lean();
      if (!rows.length) break;
      batches += 1;

      if (!officialIds) {
        const official = await Source.find({ kind: 'official' }, { _id: 1 }).lean();
        officialIds = new Set(official.map((s) => String(s._id)));
      }

      // Open stories this batch could join and that are not loaded yet.
      const floor = new Date(rows[0].publishedAt).getTime() - windowMs;
      if (floor < loadedFrom) {
        const range = { $gte: new Date(floor) };
        if (Number.isFinite(loadedFrom)) range.$lt = new Date(loadedFrom);
        const docs = await Story.find({ model, solo: { $ne: true }, lastArticleAt: range }).lean();
        for (const doc of docs) {
          const key = String(doc._id);
          if (known.has(key) || !doc.sum?.length) continue;
          known.add(key);
          stories.push(hydrate(doc));
        }
        loadedFrom = floor;
      }

      const articles = rows.map((r) => ({
        ...r,
        vector: Float64Array.from(r.embedding.vector),
        embedding: undefined,
        textLength: String(r.title || '').length + String(r.excerpt || '').length,
      }));
      const results = assignBatch({
        articles,
        stories,
        isOfficial: (a) => officialIds.has(String(a.sourceId)),
        newId: () => new mongoose.Types.ObjectId(),
        options,
      });

      const dirty = stories.filter((s) => s.dirty);
      if (dirty.length) {
        await Story.bulkWrite(dirty.map((s) => storyWrite(s, model)), { ordered: false });
        for (const s of dirty) {
          s.dirty = false;
          s.created = false;
          if (!s.solo && s.articleCount > 1) s.seedStored = true;
          known.add(String(s.id));
        }
      }
      await Article.bulkWrite(results.map((r) => ({
        updateOne: { filter: { _id: r.articleId }, update: { $set: { storyId: r.storyId } } },
      })), { ordered: false, timestamps: false });

      assigned += results.length;
      joined += results.filter((r) => r.joined).length;
      // Solo stories are never joined: no need to carry them through the pass.
      for (let i = stories.length - 1; i >= 0; i -= 1) if (stories[i].solo) stories.splice(i, 1);
      if (rows.length < batchSize) break;
      if (clock() - started >= tickBudgetMs) break;
    }

    state.pending = await Article.countDocuments(filter);
    return { ran: true, assigned, joined, batches, pending: state.pending };
  }

  const tick = singleFlight(async () => {
    state.running = true;
    current = pass();
    try {
      const out = await current;
      state.lastRunAssigned = out.assigned;
      state.lastRunJoined = out.joined;
      state.lastError = null;
      if (out.assigned) log?.info({ event: 'story_tick', assigned: out.assigned, joined: out.joined, batches: out.batches, pending: out.pending }, 'story tick');
      return out;
    } catch (err) {
      // A database error: whatever was not written comes round again.
      state.lastError = err?.name || 'Error';
      log?.error({ event: 'story_tick_failed', name: err?.name, code: err?.code }, 'story tick failed');
      return { error: true };
    } finally {
      state.running = false;
      state.lastRunAt = now();
      current = null;
    }
  });

  let boot = null;
  let interval = null;

  return {
    tick,
    status: () => ({ ...state }),
    start({ env = process.env, bootDelayMs = 30_000, intervalMs = TICK_MS } = {}) {
      const enabled = env.STORIES_DISABLED !== '1' && (env.NODE_ENV === 'production' || env.STORIES_AUTORUN === '1');
      state.enabled = enabled;
      if (!enabled) {
        log?.info({ event: 'story_schedule', enabled: false }, 'story assigner off');
        return { enabled: false };
      }
      boot = setTimeout(tick, bootDelayMs);
      boot.unref();
      interval = setInterval(tick, intervalMs);
      interval.unref();
      log?.info({ event: 'story_schedule', enabled: true, intervalMs, batchSize }, 'story assigner started');
      return { enabled: true };
    },
    async stop({ waitMs = 5_000 } = {}) {
      stopping = true;
      if (boot) clearTimeout(boot);
      if (interval) clearInterval(interval);
      if (current) {
        await Promise.race([current.catch(() => {}), new Promise((r) => { setTimeout(r, waitMs).unref(); })]);
      }
    },
  };
}

export default { createStoryAssigner, queueFilter, TICK_MS, BATCH_SIZE, ASSIGN_DAYS };
