/**
 * The comics folder scan (2026-11-16): Tankarr's library, indexed in place.
 *
 * Tankarr writes `Title (Author, Author)/Title - v019 [en].cbz` under
 * /mnt/Media/Comics, which this container sees READ-ONLY at `COMICS_PATH`,
 * inside the library root (see ../comicsPaths.js). Each volume becomes one
 * `Book` whose file entry points at Tankarr's file. BookGeek never copies,
 * moves, renames or deletes anything there, and never opens an archive: what
 * it knows comes from the NAMES, plus — optionally — Tankarr's API
 * (./tankarrApi.js) for the description, year, kind and artwork.
 *
 * The first half of this file is pure (names in, facts out). The second half
 * does the IO and is the only part that touches the disk or the database.
 */
import fs from "fs";
import path from "path";
import { includingDeleted } from "../models/book.js";
import { COMIC_FORMATS } from "../formats.js";
import { escapeRegex, libraryRoot, resolveInLibrary } from "../libraryPaths.js";
import {
  comicsConfig,
  isComicsPath,
  isTankarrArtworkPath,
  TANKARR_ARTWORK_DIR,
  TANKARR_ARTWORK_PREFIX,
  TANKARR_SOURCE,
} from "../comicsPaths.js";
import { withDerivedTags } from "../tags.js";
import { artworkStem, fetchTankarrArtwork, loadTankarrSeries, normalizeTitle } from "./tankarrApi.js";

/* ------------------------------------------------------------------ pure -- */

/** What the scan indexes: the comic archives, plus PDF and EPUB (Chef's manga are EPUBs). */
export const COMICS_FOLDER_FORMATS = [...COMIC_FORMATS, "pdf", "epub"];

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif"];
/** A file this young may still be being written by Tankarr. */
export const SETTLE_MS = 2 * 60 * 1000;
const MAX_DEPTH = 3;

const extOf = (name) => path.extname(name).slice(1).toLowerCase();
const squash = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

/**
 * `Title (Author, Author)` → { name, authors }. The LAST parenthesised group
 * is the authors; a folder without one has none.
 */
export function parseSeriesFolder(folderName) {
  const raw = squash(folderName);
  const m = /^(.*\S)\s*\(([^()]*)\)$/.exec(raw);
  if (!m) return { name: raw, authors: [] };
  const authors = m[2].split(",").map(squash).filter(Boolean);
  return { name: squash(m[1]), authors };
}

const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
// "Banana Fish - v019 [en]", "Title - Vol. 3", "Title - Volume 12 (Digital) [en]".
// After the number only bracketed or parenthesised notes may follow; anything
// else and the name is not trusted to carry a volume.
const VOLUME_NAME = /^(.+?)\s+-\s+(?:v|vol\.?|volume)\s*(\d{1,4}(?:\.\d{1,2})?)((?:\s*(?:\[[^\][]*\]|\([^()]*\)))*)$/i;

/**
 * A file name → what it says, or null for something that is not a comic file
 * (a dotfile, an image, an unknown extension).
 *   { format, base, title, volume, language }
 * `volume` is null when the name carries no volume number; the base name is
 * then the title. Nothing here looks inside the file.
 */
export function parseVolumeFile(fileName) {
  const name = String(fileName ?? "");
  if (!name || name.startsWith(".")) return null;
  const format = extOf(name);
  if (!COMICS_FOLDER_FORMATS.includes(format)) return null;
  const base = squash(path.basename(name, path.extname(name)));
  if (!base) return null;

  const brackets = [...base.matchAll(/\[([^\][]*)\]/g)].map((b) => squash(b[1]));
  const language = (brackets.find((b) => LANGUAGE_TAG.test(b)) || "").toLowerCase() || null;

  const m = VOLUME_NAME.exec(base);
  if (!m) return { format, base, title: base, volume: null, language };
  const volume = Number(m[2]);
  if (!Number.isFinite(volume)) return { format, base, title: base, volume: null, language };
  return { format, base, title: squash(m[1]), volume, language };
}

/** Why a directory entry is not indexed: "dotfile", "image", "unsupported" — or null when it is. */
export function ignoreReason(fileName) {
  const name = String(fileName ?? "");
  if (!name || name.startsWith(".")) return "dotfile";
  const ext = extOf(name);
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (!COMICS_FOLDER_FORMATS.includes(ext)) return "unsupported";
  return null;
}

/**
 * The facts for one file: `folder` is the top-level series folder's name
 * (null for a file lying loose in the comics root).
 *   { seriesName, folderAuthors, title, volume, language, format, key }
 * A volume's title is the SERIES name: the card wears "MANGA · VOL. 3" above
 * it (web/src/utils/comic.js `comicLine`), so a title carrying the volume
 * would say it twice.
 */
export function describeComicFile(folder, fileName) {
  const parsed = parseVolumeFile(fileName);
  if (!parsed) return null;
  const series = folder ? parseSeriesFolder(folder) : { name: parsed.volume === null ? "" : parsed.title, authors: [] };
  const seriesName = series.name;
  const title = parsed.volume === null ? parsed.title : seriesName || parsed.title;
  // Same series + same volume is the same book, whatever the file is called
  // (Tankarr renames and upgrades). Without a volume, the name is all there is.
  const key =
    parsed.volume === null
      ? `${normalizeTitle(seriesName)}|t:${normalizeTitle(parsed.base)}`
      : `${normalizeTitle(seriesName)}|v:${parsed.volume}`;
  return { ...parsed, seriesName, folderAuthors: series.authors, title, key };
}

/** The same key, from a stored row — so a renamed file finds the row it replaces. */
export function rowKeys(row) {
  const seriesName = row?.series?.name || "";
  const keys = [];
  const index = row?.series?.index;
  if (typeof index === "number" && Number.isFinite(index)) keys.push(`${normalizeTitle(seriesName)}|v:${index}`);
  else keys.push(`${normalizeTitle(seriesName)}|t:${normalizeTitle(row?.title)}`);
  return keys;
}

const sameList = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => String(v) === String(b[i]));

export function comicsTag(env = process.env) {
  return squash(env.COMICS_TAG) || "Manga";
}

export function scanMinutes(env = process.env) {
  const raw = String(env.COMICS_SCAN_MINUTES ?? "").trim();
  if (raw === "") return 15;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 15;
}

/* -------------------------------------------------------------------- IO -- */

/**
 * Is the feature on? `{ enabled: true, root, rel }` or `{ enabled: false,
 * reason }` with reason "unset", "outside-library" or "missing". Never throws.
 */
export async function comicsFolderStatus(env = process.env) {
  const cfg = comicsConfig(env);
  if (!cfg.configured) return { enabled: false, reason: cfg.reason };
  try {
    const stat = await fs.promises.stat(cfg.root);
    if (!stat.isDirectory()) return { enabled: false, reason: "missing" };
  } catch {
    return { enabled: false, reason: "missing" };
  }
  return { enabled: true, root: cfg.root, rel: cfg.rel };
}

/**
 * Walk the comics folder. Names and `stat` only — no file is opened.
 * Symlinks are not followed (a link could lead out of the library).
 */
export async function listComicsFolder({ root, rel }, { now = Date.now(), settleMs = SETTLE_MS } = {}) {
  const out = {
    files: [], // settled comic files, ready to index
    present: new Set(), // every comic file on disk, settled or not (library-relative)
    images: new Map(), // library-relative dir → Set of image file names
    failedDirs: [], // library-relative dirs that could not be read
    skippedRecent: 0,
    skippedUnsupported: 0,
    ignored: 0,
  };

  async function walk(absDir, relDir, folder, depth) {
    let entries;
    try {
      entries = await fs.promises.readdir(absDir, { withFileTypes: true });
    } catch (err) {
      out.failedDirs.push(relDir);
      return err;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        out.ignored += 1;
        continue;
      }
      const absPath = path.join(absDir, entry.name);
      const relPath = path.join(relDir, entry.name);
      if (entry.isDirectory()) {
        // eslint-disable-next-line no-await-in-loop
        if (depth < MAX_DEPTH) await walk(absPath, relPath, folder ?? entry.name, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        out.ignored += 1;
        continue;
      }
      const reason = ignoreReason(entry.name);
      if (reason === "image") {
        if (!out.images.has(relDir)) out.images.set(relDir, new Set());
        out.images.get(relDir).add(entry.name);
        out.ignored += 1;
        continue;
      }
      if (reason) {
        out.skippedUnsupported += 1;
        continue;
      }
      const facts = describeComicFile(folder, entry.name);
      if (!facts || !resolveInLibrary(relPath)) {
        out.skippedUnsupported += 1;
        continue;
      }
      let stat;
      try {
        // eslint-disable-next-line no-await-in-loop
        stat = await fs.promises.stat(absPath);
      } catch {
        continue; // gone between readdir and stat
      }
      out.present.add(relPath);
      if (now - stat.mtimeMs < settleMs) {
        out.skippedRecent += 1;
        continue;
      }
      out.files.push({ relPath, relDir, fileName: entry.name, folder, facts, size: stat.size, mtime: new Date(stat.mtimeMs) });
    }
    return null;
  }

  const rootError = await walk(root, rel, null, 0);
  return { ...out, rootError };
}

/** The local image for a file: its sibling `<same name>.<img>`, else the folder's `cover.<img>`. */
function localCover(file, images) {
  const names = images.get(file.relDir);
  if (!names) return null;
  const stem = path.basename(file.fileName, path.extname(file.fileName));
  for (const ext of IMAGE_EXTS) {
    if (names.has(`${stem}.${ext}`)) return path.join(file.relDir, `${stem}.${ext}`);
  }
  for (const ext of IMAGE_EXTS) {
    if (names.has(`cover.${ext}`)) return path.join(file.relDir, `cover.${ext}`);
  }
  return null;
}

const fileEntry = (file) => ({
  format: file.facts.format.toUpperCase(),
  path: file.relPath,
  size: file.size,
  addedAt: file.mtime,
});

const blank = (value) => value === undefined || value === null || (typeof value === "string" && !value.trim());

/**
 * Scan once. Resolves to the counts, or `{ enabled: false, reason }` when the
 * feature is off; rejects only on a database error.
 *
 * `models.Book` needs `find(filter).lean()`, `create(doc)` and
 * `updateOne(filter, update)`.
 */
export async function scanComicsFolder({
  models,
  env = process.env,
  now = Date.now(),
  logger = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { Book } = models;
  const status = await comicsFolderStatus(env);
  if (!status.enabled) return { enabled: false, reason: status.reason };

  const listing = await listComicsFolder(status, { now });
  if (listing.rootError) {
    logger?.warn?.({ err: listing.rootError.message }, "[bookgeek] comics scan: the comics folder could not be read");
    return { enabled: false, reason: "missing" };
  }

  const apiIndex = await loadTankarrSeries({ env, fetchImpl, logger });
  const defaultTag = comicsTag(env);

  // Every row that is ours or holds one of our paths — INCLUDING the ones in
  // Recently deleted: `hideDeletedBooks` would otherwise hide a trashed volume
  // and the scan would re-create it on the next pass.
  const prefix = `^${escapeRegex(status.rel + path.sep)}`;
  const rows = await Book.find(
    includingDeleted({ $or: [{ source: TANKARR_SOURCE }, { "files.path": { $regex: prefix } }] }),
  ).lean();

  const states = rows.map((row) => ({
    row,
    files: (Array.isArray(row.files) ? row.files : []).map((f) => ({ ...f })),
    filesChanged: false,
    isNew: false,
    diskFile: null,
  }));
  const byPath = new Map();
  const byKey = new Map();
  for (const state of states) {
    for (const f of state.files) if (f?.path && !byPath.has(f.path)) byPath.set(f.path, state);
    if (state.row.source === TANKARR_SOURCE) {
      for (const key of rowKeys(state.row)) if (!byKey.has(key)) byKey.set(key, state);
    }
  }

  for (const file of listing.files) {
    let state = byPath.get(file.relPath);
    if (state) {
      const entry = state.files.find((f) => f.path === file.relPath);
      if (entry && entry.size !== file.size) {
        entry.size = file.size; // upgraded in place under the same name
        state.filesChanged = true;
      }
    } else {
      state = byKey.get(file.facts.key);
      if (state) {
        // Same series and volume, new file name: Tankarr renamed or upgraded
        // it (the dead entry is dropped below), or holds a second format.
        state.files.push(fileEntry(file));
        state.filesChanged = true;
      } else {
        state = { row: null, files: [fileEntry(file)], filesChanged: true, isNew: true, diskFile: null };
        states.push(state);
        byKey.set(file.facts.key, state);
      }
      byPath.set(file.relPath, state);
    }
    if (!state.diskFile) state.diskFile = file;
  }

  // Entries whose file is gone. The row stays — every reader's shelf, rating
  // and history hang off it — and only the dead entry goes.
  const unreadable = (relPath) => listing.failedDirs.some((dir) => relPath === dir || relPath.startsWith(dir + path.sep));
  const dead = [];
  for (const state of states) {
    for (const f of state.files) {
      if (f?.path && isComicsPath(f.path, env) && !listing.present.has(f.path) && !unreadable(f.path)) {
        dead.push({ state, entry: f });
      }
    }
  }
  let missing = 0;
  let missingHeld = 0;
  if (dead.length > 0 && listing.present.size === 0) {
    // An empty folder with rows still pointing into it is what an unmounted
    // disk looks like. Believing it would strip every volume's file.
    missingHeld = dead.length;
    logger?.warn?.({ entries: dead.length }, "[bookgeek] comics scan: the comics folder is empty; keeping every file entry");
  } else {
    for (const { state, entry } of dead) {
      state.files = state.files.filter((f) => f !== entry);
      state.filesChanged = true;
      missing += 1;
      logger?.info?.(
        { bookId: state.row ? String(state.row._id) : null, path: entry.path },
        "[bookgeek] comics scan: file gone from the comics folder; entry removed, book kept",
      );
    }
  }

  // Tankarr artwork, for a series whose folder has no image: one fetch per
  // series per scan, none at all after the first failure.
  const artworkCache = new Map();
  let artworkDown = false;
  async function artworkFor(series) {
    if (!series?.artworkPath) return null;
    const stem = TANKARR_ARTWORK_PREFIX + artworkStem(series);
    if (artworkCache.has(stem)) return artworkCache.get(stem);
    let rel = null;
    const coversAbs = resolveInLibrary(TANKARR_ARTWORK_DIR, env.LIBRARY_PATH || libraryRoot());
    try {
      const have = coversAbs
        ? (await fs.promises.readdir(coversAbs).catch(() => [])).find((n) => n.startsWith(`${stem}.`))
        : null;
      if (have) rel = path.join(TANKARR_ARTWORK_DIR, have);
      else if (coversAbs && !artworkDown) {
        const art = await fetchTankarrArtwork(series, { env, fetchImpl, logger });
        if (!art) artworkDown = true;
        else {
          await fs.promises.mkdir(coversAbs, { recursive: true });
          await fs.promises.writeFile(path.join(coversAbs, `${stem}.${art.ext}`), art.buffer);
          rel = path.join(TANKARR_ARTWORK_DIR, `${stem}.${art.ext}`);
        }
      }
    } catch (err) {
      artworkDown = true;
      logger?.warn?.({ err: err?.message }, "[bookgeek] comics scan: artwork could not be saved");
    }
    artworkCache.set(stem, rel);
    return rel;
  }

  const counts = { added: 0, updated: 0, unchanged: 0 };

  for (const state of states) {
    const file = state.diskFile;
    const row = state.row;
    const ours = state.isNew || row.source === TANKARR_SOURCE;
    const series = file && apiIndex ? apiIndex.get(normalizeTitle(file.facts.seriesName)) || null : null;
    const set = {};
    const unset = {};

    if (state.filesChanged) set.files = state.files;

    if (ours) {
      const owned = state.files.length > 0;
      if (state.isNew || Boolean(row.owned) !== owned) set.owned = owned;
    }

    // The cover: only where there is none, or where the one there is ours
    // (a path in the comics folder, or artwork this scan saved). A cover a
    // person chose lives elsewhere in covers/ and is never replaced.
    if (ours && file) {
      const current = state.isNew ? null : row.coverPath || null;
      const scannerOwned = !current || isComicsPath(current, env) || isTankarrArtworkPath(current);
      if (scannerOwned) {
        // eslint-disable-next-line no-await-in-loop
        const wanted = localCover(file, listing.images) || (await artworkFor(series));
        if (wanted && wanted !== current) set.coverPath = wanted;
        else if (!wanted && current && isComicsPath(current, env)) {
          const names = listing.images.get(path.dirname(current));
          if (!names || !names.has(path.basename(current))) unset.coverPath = "";
        }
      }
    }

    if (state.isNew) {
      const { facts } = file;
      const authors = series?.authors.length ? series.authors : facts.folderAuthors;
      const doc = {
        title: facts.title,
        authors,
        series: facts.volume === null ? { name: facts.seriesName } : { name: facts.seriesName, index: facts.volume },
        language: facts.language || undefined,
        description: series?.description || undefined,
        publishedDate: series?.year ? new Date(Date.UTC(series.year, 0, 1)) : undefined,
        tags: [series?.tag || defaultTag],
        files: state.files,
        coverPath: set.coverPath,
        owned: true,
        dateAdded: file.mtime,
        source: TANKARR_SOURCE,
      };
      if (!doc.series.name) delete doc.series;
      // eslint-disable-next-line no-await-in-loop
      await Book.create(withDerivedTags(doc));
      counts.added += 1;
      continue;
    }

    // Tankarr's metadata on a row the scan made earlier: blanks are filled,
    // and a value the scan itself wrote (authors still exactly the folder's,
    // tags still exactly the default tag) may be bettered. Anything else was
    // typed by a person and stays.
    if (ours && file && series) {
      const authors = Array.isArray(row.authors) ? row.authors : [];
      const scannerAuthors = authors.length === 0 || sameList(authors, file.facts.folderAuthors);
      if (series.authors.length && scannerAuthors && !sameList(authors, series.authors)) set.authors = series.authors;
      if (series.description && blank(row.description)) set.description = series.description;
      if (series.year && blank(row.publishedDate)) set.publishedDate = new Date(Date.UTC(series.year, 0, 1));
      const tags = Array.isArray(row.tags) ? row.tags : [];
      const scannerTags = tags.length === 0 || sameList(tags, [defaultTag]);
      if (series.tag && scannerTags && !sameList(tags, [series.tag])) {
        Object.assign(set, withDerivedTags({ tags: [series.tag] }));
      }
    }

    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
      if (file) counts.unchanged += 1;
      continue;
    }
    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    // eslint-disable-next-line no-await-in-loop
    await Book.updateOne(includingDeleted({ _id: row._id }), update);
    counts.updated += 1;
  }

  const result = {
    enabled: true,
    ...counts,
    missing,
    skipped: listing.skippedRecent + listing.skippedUnsupported,
    skippedRecent: listing.skippedRecent,
    skippedUnsupported: listing.skippedUnsupported,
    missingHeld,
    files: listing.files.length,
    tankarrApi: apiIndex ? "used" : env.TANKARR_URL ? "unavailable" : "off",
  };
  const quiet = !result.added && !result.updated && !result.missing && !result.missingHeld;
  logger?.[quiet ? "debug" : "info"]?.(result, "[bookgeek] comics scan done");
  if (listing.skippedUnsupported || listing.failedDirs.length) {
    logger?.info?.(
      { unsupported: listing.skippedUnsupported, unreadableDirs: listing.failedDirs.length },
      "[bookgeek] comics scan: entries skipped",
    );
  }
  return result;
}

/* ------------------------------------------------------------- triggers -- */

let inFlight = null;
let lastResult = null;
let offLogged = false;

/**
 * Run a scan unless one is already running, in which case the caller gets
 * that one's result — a scan never overlaps itself. "Feature off" is logged
 * once per process, not every fifteen minutes.
 */
export function runComicsScan(options = {}) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const result = await scanComicsFolder(options);
      if (!result.enabled && !offLogged) {
        offLogged = true;
        options.logger?.info?.({ reason: result.reason }, "[bookgeek] comics folder is off (COMICS_PATH)");
      }
      lastResult = { at: new Date(), ...result };
      return result;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export const comicsScanRunning = () => Boolean(inFlight);
export const lastComicsScan = () => lastResult;

/**
 * Once shortly after boot, then every COMICS_SCAN_MINUTES (default 15). 0
 * disables the timer; the boot scan still runs.
 * Timers are unref'd so they never hold the process open. Returns a stop().
 */
export function startComicsScanSchedule({ models, env = process.env, logger = null, bootDelayMs = 20000, timers = globalThis } = {}) {
  const tick = () =>
    runComicsScan({ models, env, logger }).catch((err) =>
      logger?.warn?.({ err: err?.message }, "[bookgeek] comics scan failed"),
    );
  const boot = timers.setTimeout(tick, bootDelayMs);
  boot?.unref?.();
  const minutes = scanMinutes(env);
  let interval = null;
  if (minutes > 0) {
    interval = timers.setInterval(tick, minutes * 60 * 1000);
    interval?.unref?.();
  }
  return () => {
    timers.clearTimeout(boot);
    if (interval) timers.clearInterval(interval);
  };
}
