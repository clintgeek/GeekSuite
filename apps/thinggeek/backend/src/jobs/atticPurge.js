/**
 * The Attic's purge — rides the daily trash purge (jobs/purge.js), the one
 * place bytes are deleted.
 *
 *   (a) A document deleted more than ATTIC_GRACE_MS ago is removed, and with
 *       it every sealed file it owned (record first, then the bytes). There
 *       is no Attic trash to restore from: a deleted passport scan should
 *       not linger, even encrypted.
 *   (b) A sealed file no live document holds (an upload that lost a race
 *       with a delete, an entry the gateway removed from files[]) is removed
 *       once it is older than ATTIC_GRACE_MS.
 *
 * Household-scoped, counts-only logging (never ids or paths).
 */
import { deleteFileQuiet } from '../lib/fileStorage.js';

export const ATTIC_GRACE_MS = 60 * 60 * 1000;
const BATCH = 200;

async function removeFile(AtticFile, root, file) {
  const res = await AtticFile.deleteOne({ _id: file._id, householdId: file.householdId });
  if (res?.deletedCount) await deleteFileQuiet(root, file.path);
  return Boolean(res?.deletedCount);
}

export async function purgeAttic({ AtticDocument, AtticFile, root, now = () => new Date() }) {
  const cutoff = new Date(now().getTime() - ATTIC_GRACE_MS);
  const totals = { documents: 0, files: 0 };

  for (let i = 0; i < 1000; i += 1) {
    const gone = await AtticDocument.find({ deletedAt: { $ne: null, $lt: cutoff } }, { _id: 1, householdId: 1 }).limit(BATCH).lean();
    if (!gone.length) break;
    for (const doc of gone) {
      const files = await AtticFile.find({ householdId: doc.householdId, documentId: doc._id }).lean();
      for (const f of files) if (await removeFile(AtticFile, root, f)) totals.files += 1;
      const r = await AtticDocument.deleteOne({ _id: doc._id, householdId: doc.householdId, deletedAt: { $ne: null, $lt: cutoff } });
      totals.documents += r?.deletedCount ? 1 : 0;
    }
  }

  const old = await AtticFile.find({ createdAt: { $lt: cutoff } }).lean();
  for (const f of old) {
    const held = await AtticDocument.exists({ _id: f.documentId, householdId: f.householdId, deletedAt: null, 'files.fileId': f._id });
    if (held) continue;
    if (await removeFile(AtticFile, root, f)) totals.files += 1;
  }
  return totals;
}

export default { purgeAttic, ATTIC_GRACE_MS };
