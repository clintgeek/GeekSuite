/**
 * Store an uploaded buffer for a household: sniff, hash, dedupe, write,
 * thumbnail, record. Returns the ThingFile record (lean) or throws an
 * HttpError the route turns into a response.
 *
 * Dedupe (DOCS/THINGGEEK_PLAN.md "Checks"): a household never stores the same
 * bytes twice. Reusing a record TOUCHES it (updatedAt = now) before it is
 * attached anywhere — that is what makes the purge's delete safe against a
 * concurrent reuse: the purge only deletes records whose updatedAt is older
 * than TRASH_DAYS, and re-checks that in its delete filter.
 */
import crypto from 'node:crypto';
import { sniffFile, isAllowedFor, isImageMime } from '../lib/fileSniff.js';
import { buildRelPaths, writeFileAtomic, fileExists } from '../lib/fileStorage.js';
import { makeThumbnail } from '../lib/thumbnail.js';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Keep a display name only: no directories, no control chars, bounded. */
export function cleanOriginalName(name) {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
}

/**
 * @param {object} args
 * @param {Buffer} args.buffer
 * @param {'photo'|'document'} args.kind
 * @param {string} args.householdId  from the member gate, never the client
 * @param {string|null} args.userId
 * @param {string} args.originalName
 * @param {string} args.root          absolute FILES_PATH
 * @param {object} args.ThingFile     the model
 * @param {() => Date} [args.now]
 * @param {object} [args.log]
 * @returns {Promise<{ record: object, deduped: boolean }>}
 */
export async function storeFile({ buffer, kind, householdId, userId, originalName, root, ThingFile, now = () => new Date(), log }) {
  const sniffed = sniffFile(buffer);
  if (!sniffed || !isAllowedFor(kind, sniffed.mime)) {
    throw new HttpError(415, 'UNSUPPORTED_TYPE', kind === 'photo'
      ? 'Photos must be JPEG, PNG, WebP or HEIC.'
      : 'Documents must be PDF, JPEG, PNG, WebP or plain text.');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // Dedupe: touch-then-read, atomically (see header).
  const existing = await ThingFile.findOneAndUpdate(
    { householdId, sha256 },
    { $set: { updatedAt: now() } },
    { new: true, timestamps: false },
  ).lean();
  if (existing) {
    // Self-heal a record whose bytes went missing (restored backup, manual
    // cleanup): same sha, so rewriting them is exactly right.
    if (!(await fileExists(root, existing.path))) {
      await writeFileAtomic(root, existing.path, buffer);
      log?.warn({ event: 'file_bytes_rewritten' }, 'deduped file had no bytes on disk; rewrote them');
    }
    return { record: existing, deduped: true };
  }

  const rel = buildRelPaths({ householdId, sha256, ext: sniffed.ext, date: now() });
  await writeFileAtomic(root, rel.path, buffer);

  let thumbPath = null;
  let width = null;
  let height = null;
  if (isImageMime(sniffed.mime)) {
    const result = await makeThumbnail(buffer);
    if (result) {
      await writeFileAtomic(root, rel.thumbPath, result.thumb);
      thumbPath = rel.thumbPath;
      ({ width, height } = result);
    } else {
      // Never fail an upload for this (HEIC without an HEVC decoder, mostly).
      log?.info({ event: 'thumbnail_unavailable', mime: sniffed.mime }, 'stored without a thumbnail');
    }
  }

  let created;
  try {
    created = await ThingFile.create({
      householdId,
      kind,
      mime: sniffed.mime,
      size: buffer.length,
      sha256,
      path: rel.path,
      thumbPath,
      width,
      height,
      originalName: cleanOriginalName(originalName),
      uploadedBy: userId ? String(userId) : null,
    });
  } catch (err) {
    // Two simultaneous uploads of the same bytes, once a unique
    // {householdId, sha256} index exists: the loser reuses the winner.
    if (err?.code !== 11000) throw err;
    const winner = await ThingFile.findOne({ householdId, sha256 }).lean();
    if (!winner) throw err;
    return { record: winner, deduped: true };
  }
  const record = typeof created.toObject === 'function' ? created.toObject() : created;
  return { record, deduped: false };
}

export default { storeFile, HttpError, cleanOriginalName };
