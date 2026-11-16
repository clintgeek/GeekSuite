/**
 * The comics folder (Tankarr's library), as BookGeek sees it (2026-11-16).
 *
 * Tankarr owns `/mnt/Media/Comics`: it writes, renames and upgrades the files
 * there. BookGeek mounts that folder READ-ONLY inside its own library root
 * (`COMICS_PATH`, e.g. /data/library/_tankarr) and indexes the files in place,
 * so a stored `Book.files[].path` is `_tankarr/<series folder>/<file>` and
 * every existing file route resolves it through libraryPaths.js unchanged.
 *
 * This module is the one answer to "is this stored path Tankarr's?". Every
 * piece of code that unlinks, moves or writes beside a book's files asks it
 * first — the `:ro` mount is the second line of defence, not the first (a
 * dev box, or a compose file that lost the flag, has no such mount).
 *
 * No model imports, so the trash, the cover helpers and the converter can all
 * load it.
 */
import path from "path";
import { libraryRoot } from "./libraryPaths.js";

/** `Book.source` of a volume the comics scan created. */
export const TANKARR_SOURCE = "tankarr";

/** Cover files the scan itself saved from Tankarr's artwork: covers/tankarr-<hash>.<ext>. */
export const TANKARR_ARTWORK_DIR = "covers";
export const TANKARR_ARTWORK_PREFIX = "tankarr-";

/**
 * Where the comics folder is, from the env. Synchronous and never throws.
 *   { configured: false, reason: "unset" | "outside-library" }
 *   { configured: true, root: <absolute>, rel: <library-relative, posix-free> }
 * "configured" says nothing about the folder existing — the scan stats it.
 */
export function comicsConfig(env = process.env) {
  const raw = String(env.COMICS_PATH || "").trim();
  if (!raw) return { configured: false, reason: "unset" };
  const base = path.resolve(env.LIBRARY_PATH || libraryRoot());
  const full = path.resolve(raw);
  if (full === base || !full.startsWith(base + path.sep)) {
    return { configured: false, reason: "outside-library" };
  }
  return { configured: true, root: full, rel: path.relative(base, full) };
}

/** Is this stored, library-relative path inside the comics folder? False when the feature is off. */
export function isComicsPath(relPath, env = process.env) {
  const cfg = comicsConfig(env);
  if (!cfg.configured || typeof relPath !== "string" || !relPath) return false;
  const norm = path.normalize(relPath);
  return norm === cfg.rel || norm.startsWith(cfg.rel + path.sep);
}

/** A cover the scan saved from Tankarr's artwork. One file serves every volume of a series. */
export function isTankarrArtworkPath(relPath) {
  if (typeof relPath !== "string" || !relPath) return false;
  const norm = path.normalize(relPath);
  return path.dirname(norm) === TANKARR_ARTWORK_DIR && path.basename(norm).startsWith(TANKARR_ARTWORK_PREFIX);
}

/**
 * May BookGeek unlink this file of this book? Never a file in the comics
 * folder, never the shared series artwork — and, for a Tankarr volume while
 * the feature is switched off (so the folder can no longer be recognised by
 * its prefix), nothing at all.
 */
export function mayUnlinkBookFile(book, relPath, env = process.env) {
  if (isComicsPath(relPath, env)) return false;
  if (isTankarrArtworkPath(relPath)) return false;
  if (book && book.source === TANKARR_SOURCE && !comicsConfig(env).configured) return false;
  return true;
}
