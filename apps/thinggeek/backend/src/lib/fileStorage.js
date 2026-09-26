/**
 * Where ThingGeek's bytes live, and the path-confinement check every read,
 * write and delete goes through before touching the filesystem.
 *
 * Layout (DOCS/THINGGEEK_PLAN.md "Files"): relative to FILES_PATH,
 *   <householdId>/<yyyy>/<mm>/<sha256>.<ext>          the original
 *   <householdId>/<yyyy>/<mm>/<sha256>.thumb.webp     its thumbnail
 *
 * Every component is validated (householdId charset, 64-hex sha, fixed ext
 * set from fileSniff.js) so none can carry a separator — and the resolved
 * path is still asserted to sit inside FILES_PATH, as defense in depth and
 * because a stored `path` read back from Mongo is data, not trusted code.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DEFAULT_FILES_PATH = '/data/files';

export function filesRoot(configured) {
  return path.resolve(configured || process.env.FILES_PATH || DEFAULT_FILES_PATH);
}

export const CONTENT_TYPE_BY_EXT = Object.freeze({
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
});

const HOUSEHOLD_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SHA_RE = /^[0-9a-f]{64}$/;

export class PathEscapeError extends Error {
  constructor() {
    super('path escapes the files directory');
    this.code = 'PATH_ESCAPE';
  }
}

/**
 * Resolve a stored relative path to an absolute one guaranteed to sit inside
 * `root`. Throws PathEscapeError rather than returning a path that escaped.
 */
export function resolveInside(root, relPath) {
  if (typeof relPath !== 'string' || !relPath || relPath.includes('\0') || path.isAbsolute(relPath)) {
    throw new PathEscapeError();
  }
  const base = path.resolve(root);
  const target = path.resolve(base, relPath);
  if (target === base || !target.startsWith(base + path.sep)) throw new PathEscapeError();
  return target;
}

/** The relative paths for a new original + its thumbnail. */
export function buildRelPaths({ householdId, sha256, ext, date = new Date() }) {
  if (!HOUSEHOLD_RE.test(String(householdId))) throw new PathEscapeError();
  if (!SHA_RE.test(String(sha256))) throw new PathEscapeError();
  if (!Object.hasOwn(CONTENT_TYPE_BY_EXT, ext)) throw new PathEscapeError();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dir = `${householdId}/${yyyy}/${mm}`;
  return { path: `${dir}/${sha256}.${ext}`, thumbPath: `${dir}/${sha256}.thumb.webp` };
}

/**
 * Write bytes atomically: temp file in the same directory, then rename, so a
 * crash mid-write never leaves a truncated file under the final name.
 */
export async function writeFileAtomic(root, relPath, buffer) {
  const target = resolveInside(root, relPath);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.promises.writeFile(tmp, buffer, { mode: 0o640 });
    await fs.promises.rename(tmp, target);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
  return target;
}

export async function fileExists(root, relPath) {
  try {
    const st = await fs.promises.stat(resolveInside(root, relPath));
    return st.isFile();
  } catch {
    return false;
  }
}

/**
 * Best-effort delete; a missing file is not an error. ONLY src/jobs/purge.js
 * calls this — the purge is the one place bytes are ever deleted.
 */
export async function deleteFileQuiet(root, relPath) {
  if (!relPath) return false;
  try {
    await fs.promises.unlink(resolveInside(root, relPath));
    return true;
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.code === 'PATH_ESCAPE') return false;
    throw err;
  }
}

export function ensureFilesRoot(root) {
  fs.mkdirSync(filesRoot(root), { recursive: true });
}

export default {
  DEFAULT_FILES_PATH,
  CONTENT_TYPE_BY_EXT,
  PathEscapeError,
  filesRoot,
  resolveInside,
  buildRelPaths,
  writeFileAtomic,
  fileExists,
  deleteFileQuiet,
  ensureFilesRoot,
};
