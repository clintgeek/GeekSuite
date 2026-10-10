/**
 * Retention purge — the ONLY place NewsGeek deletes articles
 * (DOCS/NEWSGEEK_PLAN.md "Data model": articles are kept
 * ARTICLE_RETENTION_DAYS).
 *
 * Deletes articles whose publishedAt is older than the cutoff. publishedAt,
 * not fetchedAt, because ingest never stores an item older than retention
 * (pollFeed's `too_old` drop): a purged item still sitting in its feed is
 * not re-inserted on the next poll.
 *
 * Logs counts only.
 */
import constants from '@geeksuite/schemas/newsgeek/constants';
import { singleFlight } from '../lib/concurrency.js';

const { ARTICLE_RETENTION_DAYS } = constants;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * TODO(N2): saved stories outlive retention — "savedAt pins the story and
 * its articles from the purge" (plan "Data model"). When storystate lands,
 * this returns the ids of articles that belong to a story any user has
 * saved, and they are excluded below. N0 has no saved stories.
 * @returns {Promise<import('mongoose').Types.ObjectId[]>}
 */
export async function pinnedArticleIds() {
  return [];
}

/**
 * One purge pass.
 * @returns {Promise<{ articles: number, pinned: number }>}
 */
export async function runPurge({
  Article,
  retentionDays = ARTICLE_RETENTION_DAYS,
  now = () => new Date(),
  pinned = pinnedArticleIds,
  log,
}) {
  const cutoff = new Date(now().getTime() - retentionDays * DAY_MS);
  const keep = await pinned();
  const filter = { publishedAt: { $lt: cutoff } };
  if (keep.length) filter._id = { $nin: keep };
  const res = await Article.deleteMany(filter);
  const out = { articles: res?.deletedCount || 0, pinned: keep.length };
  log?.info({ event: 'purge_done', ...out }, 'article retention purge finished');
  return out;
}

/**
 * Daily schedule: once ~60 s after boot, then every 24 h. Production only
 * (or PURGE_AUTORUN=1); PURGE_DISABLED=1 is the kill switch. Timers are
 * unref'd so they never hold the process open.
 */
export function startPurgeSchedule({
  Article,
  log,
  env = process.env,
  bootDelayMs = 60_000,
  intervalMs = DAY_MS,
} = {}) {
  const enabled = env.PURGE_DISABLED !== '1' && (env.NODE_ENV === 'production' || env.PURGE_AUTORUN === '1');
  if (!enabled) {
    log?.info({ event: 'purge_schedule', enabled: false }, 'retention purge schedule off');
    return { enabled: false, stop() {} };
  }
  const run = singleFlight(async () => {
    try {
      await runPurge({ Article, log });
    } catch (err) {
      log?.error({ event: 'purge_failed', code: err?.code, name: err?.name }, 'retention purge failed');
    }
  });
  const boot = setTimeout(run, bootDelayMs);
  boot.unref();
  const interval = setInterval(run, intervalMs);
  interval.unref();
  log?.info({ event: 'purge_schedule', enabled: true }, 'retention purge scheduled daily');
  return {
    enabled: true,
    stop() {
      clearTimeout(boot);
      clearInterval(interval);
    },
  };
}

export default { runPurge, startPurgeSchedule, pinnedArticleIds };
