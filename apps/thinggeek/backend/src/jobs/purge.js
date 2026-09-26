/**
 * The Trash purge — the ONLY place ThingGeek deletes bytes
 * (DOCS/THINGGEEK_PLAN.md: a deleted Thing sits in Trash for TRASH_DAYS).
 *
 *   (a) Things whose deletedAt is older than TRASH_DAYS are hard-deleted, and
 *       other things' relationship edges pointing at them are pulled.
 *   (b) File records that NO thing in the household references (trashed
 *       things included — they own their files until they are purged) and
 *       that have not been touched for TRASH_DAYS are deleted, record first,
 *       then the original and the thumbnail.
 *
 * Safety rules:
 *   - Every query is household-scoped.
 *   - Each file's reference check runs immediately before its delete, and
 *     the delete filter re-asserts "untouched since the cutoff" — an upload
 *     that dedupes onto this record touches updatedAt first, so a reuse racing
 *     the purge makes the delete match nothing.
 *   - Bytes are unlinked only after the record is gone, and only when no
 *     other record still points at the same path.
 *   - Logs counts only — never ids, paths or names.
 */
import thingConstants from '@geeksuite/schemas/thinggeek/constants';
import { deleteFileQuiet, filesRoot as resolveFilesRoot } from '../lib/fileStorage.js';
import { singleFlight } from '../lib/concurrency.js';

const { TRASH_DAYS } = thingConstants;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH = 200;
const MAX_BATCHES = 1000; // a runaway guard, not a real limit

/** Is this file referenced by any thing (trashed or not) in the household? */
async function isReferenced(Thing, householdId, fileId) {
  const hit = await Thing.exists({
    householdId,
    $or: [{ 'photos.fileId': fileId }, { 'documents.fileId': fileId }],
  });
  return Boolean(hit);
}

async function householdsOf(Thing, ThingFile) {
  const [a, b] = await Promise.all([Thing.distinct('householdId'), ThingFile.distinct('householdId')]);
  return [...new Set([...a, ...b].filter(Boolean).map(String))];
}

async function purgeThings({ Thing, householdId, cutoff, batchSize }) {
  let deleted = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const stale = { householdId, deletedAt: { $ne: null, $lt: cutoff } };
    const batch = await Thing.find(stale, { _id: 1 }).sort({ _id: 1 }).limit(batchSize).lean();
    if (!batch.length) break;
    const ids = batch.map((t) => t._id);
    // The filter re-asserts "still trashed, still old": a restore that landed
    // since the find is honoured.
    const res = await Thing.deleteMany({ ...stale, _id: { $in: ids } });
    deleted += res?.deletedCount || 0;
    await Thing.updateMany(
      { householdId, 'relationships.thingId': { $in: ids } },
      { $pull: { relationships: { thingId: { $in: ids } } } },
    );
    if (batch.length < batchSize) break;
  }
  return deleted;
}

async function purgeFiles({ Thing, ThingFile, householdId, cutoff, batchSize, root, log }) {
  let deleted = 0;
  let kept = 0;
  let lastId = null;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const filter = { householdId, updatedAt: { $lt: cutoff } };
    if (lastId) filter._id = { $gt: lastId };
    const batch = await ThingFile.find(filter, { _id: 1, path: 1, thumbPath: 1 }).sort({ _id: 1 }).limit(batchSize).lean();
    if (!batch.length) break;
    lastId = batch[batch.length - 1]._id;

    for (const file of batch) {
      // Re-check, right before the delete.
      if (await isReferenced(Thing, householdId, file._id)) {
        kept += 1;
        continue;
      }
      const res = await ThingFile.deleteOne({ _id: file._id, householdId, updatedAt: { $lt: cutoff } });
      if (!res?.deletedCount) {
        kept += 1;
        continue;
      }
      deleted += 1;
      for (const rel of [file.path, file.thumbPath]) {
        if (!rel) continue;
        const shared = await ThingFile.exists({ householdId, $or: [{ path: rel }, { thumbPath: rel }] });
        if (shared) continue;
        try {
          await deleteFileQuiet(root, rel);
        } catch (err) {
          log?.warn({ event: 'purge_unlink_failed', code: err?.code }, 'purge could not remove a file');
        }
      }
    }
    if (batch.length < batchSize) break;
  }
  return { deleted, kept };
}

/**
 * One purge pass over every household.
 * @returns {Promise<{ things: number, files: number, filesKept: number, households: number }>}
 */
export async function runPurge({
  Thing,
  ThingFile,
  filesRoot,
  trashDays = TRASH_DAYS,
  now = () => new Date(),
  batchSize = DEFAULT_BATCH,
  log,
}) {
  const root = resolveFilesRoot(filesRoot);
  const cutoff = new Date(now().getTime() - trashDays * DAY_MS);
  const totals = { things: 0, files: 0, filesKept: 0, households: 0 };
  for (const householdId of await householdsOf(Thing, ThingFile)) {
    totals.households += 1;
    // Things first: a purged thing's files become unreferenced and are
    // reclaimed in the same pass once they, too, are older than the cutoff.
    totals.things += await purgeThings({ Thing, householdId, cutoff, batchSize });
    const f = await purgeFiles({ Thing, ThingFile, householdId, cutoff, batchSize, root, log });
    totals.files += f.deleted;
    totals.filesKept += f.kept;
  }
  log?.info({ event: 'purge_done', ...totals }, 'trash purge finished');
  return totals;
}

/**
 * Daily schedule: once ~60 s after boot, then every 24 h. Production only
 * (or PURGE_AUTORUN=1); PURGE_DISABLED=1 is the kill switch. Timers are
 * unref'd so they never hold the process open.
 */
export function startPurgeSchedule({
  Thing,
  ThingFile,
  filesRoot,
  log,
  env = process.env,
  bootDelayMs = 60_000,
  intervalMs = DAY_MS,
} = {}) {
  const enabled = env.PURGE_DISABLED !== '1' && (env.NODE_ENV === 'production' || env.PURGE_AUTORUN === '1');
  if (!enabled) {
    log?.info({ event: 'purge_schedule', enabled: false }, 'trash purge schedule off');
    return { enabled: false, stop() {} };
  }
  const run = singleFlight(async () => {
    try {
      await runPurge({ Thing, ThingFile, filesRoot, log });
    } catch (err) {
      log?.error({ event: 'purge_failed', code: err?.code, name: err?.name }, 'trash purge failed');
    }
  });
  const boot = setTimeout(run, bootDelayMs);
  boot.unref();
  const interval = setInterval(run, intervalMs);
  interval.unref();
  log?.info({ event: 'purge_schedule', enabled: true }, 'trash purge scheduled daily');
  return {
    enabled: true,
    stop() {
      clearTimeout(boot);
      clearInterval(interval);
    },
  };
}

export default { runPurge, startPurgeSchedule };
