/**
 * Cover file storage helpers: where covers live, and the path-confinement
 * check every read/write goes through before touching the filesystem.
 *
 * Filenames are always `<gameId>.<ext>` where `gameId` has already been
 * validated as a Mongo ObjectId (24 hex chars) by the caller, and `ext` comes
 * from the small fixed set imageSniff.js recognizes — neither can carry a
 * path separator — but the confinement check runs anyway, as defense in
 * depth and because it's what DOCS/GameGeekPlan.md's route spec asks for.
 */
import fs from 'node:fs';
import path from 'node:path';

export function coversDir() {
  return process.env.COVERS_PATH || '/data/covers';
}

export const CONTENT_TYPE_BY_EXT = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Resolve `<gameId>.<ext>` to an absolute path guaranteed to sit inside the
 * covers directory. Throws rather than returning a path that escaped it.
 */
export function resolveCoverPath(gameId, ext) {
  const dir = path.resolve(coversDir());
  const target = path.resolve(dir, `${gameId}.${ext}`);
  if (target !== dir && !target.startsWith(dir + path.sep)) {
    throw new Error(`resolveCoverPath: "${gameId}.${ext}" escapes the covers directory`);
  }
  return target;
}

export function ensureCoversDir() {
  fs.mkdirSync(coversDir(), { recursive: true });
}

/** Best-effort delete; a missing file is not an error. */
export function deleteCoverFileQuiet(filePath) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
}

export default {
  coversDir,
  CONTENT_TYPE_BY_EXT,
  resolveCoverPath,
  ensureCoversDir,
  deleteCoverFileQuiet,
};
