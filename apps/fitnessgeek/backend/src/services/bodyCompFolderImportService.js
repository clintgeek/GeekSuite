// bodyCompFolderImportService — import Arboleaf ".xlsx" exports that land in
// a Nextcloud folder, with nobody in the loop. Design record:
// DOCS/BODY_COMPOSITION_INTAKE.md §11.
//
// The Arboleaf app uploads its export into a per-user Nextcloud folder on the
// host; fitnessgeek's compose mounts the parent read-only at `/imports`.
// Config, both from `.env.production`:
//
//   BODYCOMP_IMPORT_ROOT=/imports
//   BODYCOMP_IMPORT_FOLDERS=<folder>:<userId>[,...]   (optional override)
//
// Root unset -> the importer is off and says so once at boot. With no
// FOLDERS override, every subfolder of the root is a user folder named with
// that user's username or email (§11.1, 2026-09-23).
//
// Three triggers, one path:
//   1. A full scan at boot. Every push to main restarts the fleet and a
//      watcher can't see files that arrived while it was down — this scan is
//      the correctness guarantee; the other two only make it prompt.
//   2. `fs.watch` per folder, debounced, and a file is read only once its size
//      has stopped changing (Nextcloud writes uploads in pieces).
//   3. A rescan every 15 minutes, for a watch event that went missing.
//
// All three feed ONE queue, so files are imported one at a time and a watch
// event racing the rescan can't import the same file twice concurrently.
//
// The folder is never written to (§11.3). "Already handled" lives in the
// `BodyCompImportFile` ledger, keyed by content hash.

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import BodyCompImportFile from '../models/BodyCompImportFile.js';
import { importBodyCompXlsxUpload } from './bodyCompXlsxImportService.js';
import { resolveImportUser } from './importUserResolver.js';
import logger from '../config/logger.js';

const DEBOUNCE_MS = 2_000;
const SETTLE_INTERVAL_MS = 1_000;
const SETTLE_ATTEMPTS = 30;
const SETTLED_AGE_MS = 30_000;
const RESCAN_MS = 15 * 60 * 1000;
// A real export is ~25 KB for a handful of scans. Anything this big isn't one.
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Parse `BODYCOMP_IMPORT_FOLDERS`. A malformed entry is logged and dropped
 * rather than failing boot — a typo here must not take the app down.
 *
 * @param {string|undefined} value - `folder:userId[,folder:userId...]`
 * @returns {Array<{folder: string, userId: string}>}
 */
export function parseImportFolders(value) {
  if (!value || !value.trim()) return [];
  const entries = [];
  for (const raw of value.split(',')) {
    const item = raw.trim();
    if (!item) continue;
    const sep = item.indexOf(':');
    const folder = sep > 0 ? item.slice(0, sep).trim() : '';
    const userId = sep > 0 ? item.slice(sep + 1).trim() : '';
    // A folder is one path segment under the root — never a path of its own.
    if (!folder || !userId || folder.includes('/') || folder.includes('\\') || folder === '.' || folder === '..') {
      logger.warn({ entry: item }, 'body-comp folder import: ignoring malformed BODYCOMP_IMPORT_FOLDERS entry');
      continue;
    }
    entries.push({ folder, userId });
  }
  return entries;
}

/**
 * Is this filename worth reading? Only finished `.xlsx` files: Nextcloud's
 * in-progress uploads end in `.part`, and dotfiles are never exports.
 *
 * @param {string} filename
 */
export function isCandidateFile(filename) {
  if (!filename || filename.startsWith('.')) return false;
  return filename.toLowerCase().endsWith('.xlsx');
}

/**
 * Wait until a file's size is the same on two consecutive checks. A file
 * untouched for `SETTLED_AGE_MS` is already finished — the folder is never
 * cleaned out, so without this every rescan would sit a second on each old
 * export.
 *
 * @returns {Promise<number|null>} the settled size, or null if the file
 *   vanished or never settled.
 */
async function waitForStableSize(filePath, { intervalMs = SETTLE_INTERVAL_MS, attempts = SETTLE_ATTEMPTS } = {}) {
  let previous = -1;
  for (let i = 0; i < attempts; i += 1) {
    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return null;
    }
    const { size } = stat;
    if (size > 0 && (size === previous || Date.now() - stat.mtimeMs > SETTLED_AGE_MS)) return size;
    previous = size;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

/**
 * Import one file, unless the ledger says its content was already handled.
 *
 * @returns {Promise<'imported'|'failed'|'already'|'not_ready'>}
 */
export async function processFile({ root, folder, userId, filename, settle }) {
  const filePath = path.join(root, folder, filename);

  const size = await waitForStableSize(filePath, settle);
  if (size === null) {
    logger.warn({ userId, folder, filename }, 'body-comp folder import: file never settled or vanished, will retry on the next scan');
    return 'not_ready';
  }

  const base = { userId, folder, filename, size };

  if (size > MAX_BYTES) {
    // No hash for a file we refuse to read, so this isn't recorded — it is
    // warned about on every scan until someone removes it, which is the point.
    logger.warn({ ...base, maxBytes: MAX_BYTES }, 'body-comp folder import: file too large to be an export, skipping');
    return 'failed';
  }

  const buffer = await fsp.readFile(filePath);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  if (await BodyCompImportFile.exists({ userId, sha256 })) return 'already';

  let status;
  let entry;
  try {
    const result = await importBodyCompXlsxUpload({ buffer, userId });
    status = 'imported';
    entry = {
      ...base,
      sha256,
      status,
      counts: { imported: result.imported, skipped: result.skipped, failed: result.failed },
      weights: result.weights,
    };
    logger.info({ ...base, ...entry.counts, weights: result.weights }, 'body-comp folder import: file imported');
  } catch (error) {
    // `parseBodyCompXlsx` throws for "this isn't a workbook at all". Row-level
    // problems never throw — they are counted in `result`.
    status = 'failed';
    entry = { ...base, sha256, status, error: error?.message || String(error) };
    logger.warn({ ...base, err: error }, 'body-comp folder import: file could not be imported; recorded, not retried until it changes');
  }

  try {
    await BodyCompImportFile.create(entry);
  } catch (error) {
    // 11000 = another pass recorded the same content first. Anything else
    // means the next scan re-imports it, which dedupe makes harmless.
    if (error?.code !== 11000) {
      logger.error({ ...base, err: error }, 'body-comp folder import: failed to record the file in the ledger');
    }
  }
  return status;
}

/**
 * Start the importer. Returns `stop()` for graceful shutdown; a no-op when
 * the importer is unconfigured.
 *
 * Two modes (DOCS/BODY_COMPOSITION_INTAKE.md §11.1):
 *   - PER-USER (default, 2026-09-23): every subfolder of the root is a user,
 *     named with their username or email; `resolveUser` turns the name into
 *     an id. A new user's folder is picked up on the next scan with no config
 *     change, and an unknown name is warned about once and skipped.
 *   - EXPLICIT: `BODYCOMP_IMPORT_FOLDERS=folder:userId[,...]` — only those
 *     folders, no lookup. The original mode, kept as an override.
 *
 * @param {{root?: string, folders?: string, rescanMs?: number, debounceMs?: number,
 *   settle?: Object, resolveUser?: (folderName: string) => Promise<string|null>}} [options]
 *   Defaults come from the environment; the overrides exist for tests.
 */
export function startBodyCompFolderImport({
  root = process.env.BODYCOMP_IMPORT_ROOT,
  folders = process.env.BODYCOMP_IMPORT_FOLDERS,
  rescanMs = RESCAN_MS,
  debounceMs = DEBOUNCE_MS,
  settle,
  resolveUser = resolveImportUser,
} = {}) {
  const explicit = parseImportFolders(folders);
  if (!root) {
    logger.info('body-comp folder import: off (BODYCOMP_IMPORT_ROOT not set)');
    return { stop: async () => {}, idle: () => Promise.resolve() };
  }
  const perUser = explicit.length === 0;

  let stopped = false;
  let queue = Promise.resolve();
  const queued = new Set();
  const debounces = new Map();
  const watchers = new Map(); // folder -> fs.FSWatcher
  const known = new Map(); // folder -> userId, for folders already resolved
  const warnedUnknown = new Set();

  const debounce = (key, fn) => {
    clearTimeout(debounces.get(key));
    const timer = setTimeout(() => {
      debounces.delete(key);
      fn();
    }, debounceMs);
    timer.unref?.();
    debounces.set(key, timer);
  };

  const enqueue = (entry, filename) => {
    if (stopped || !isCandidateFile(filename)) return;
    const key = `${entry.folder}/${filename}`;
    if (queued.has(key)) return;
    queued.add(key);
    queue = queue
      .then(() => (stopped ? null : processFile({ root, ...entry, filename, settle })))
      .catch((error) => logger.error({ err: error, folder: entry.folder, filename }, 'body-comp folder import: unexpected error'))
      .finally(() => queued.delete(key));
  };

  const scan = async (entry) => {
    let names;
    try {
      names = await fsp.readdir(path.join(root, entry.folder));
    } catch (error) {
      logger.warn({ folder: entry.folder, code: error?.code }, 'body-comp folder import: cannot read folder');
      return;
    }
    for (const name of names.sort()) enqueue(entry, name);
  };

  const watchFolder = (entry) => {
    if (stopped || watchers.has(entry.folder)) return;
    try {
      const watcher = fs.watch(path.join(root, entry.folder), (_event, filename) => {
        if (!filename) return;
        const name = filename.toString();
        debounce(`${entry.folder}/${name}`, () => enqueue(entry, name));
      });
      watcher.on('error', (error) => {
        // The rescan still covers this folder; the watch only made it prompt.
        logger.warn({ folder: entry.folder, err: error }, 'body-comp folder import: watch failed, relying on the periodic rescan');
      });
      watchers.set(entry.folder, watcher);
    } catch (error) {
      logger.warn({ folder: entry.folder, code: error?.code }, 'body-comp folder import: cannot watch folder, relying on the periodic rescan');
    }
  };

  // The folders to import from right now: the explicit list, or every
  // subfolder of the root that resolves to a user.
  const currentEntries = async () => {
    if (!perUser) return explicit;
    let dirents;
    try {
      dirents = await fsp.readdir(root, { withFileTypes: true });
    } catch (error) {
      logger.warn({ root, code: error?.code }, 'body-comp folder import: cannot read the import root');
      return [];
    }
    const entries = [];
    for (const d of dirents) {
      if (!d.isDirectory() || d.name.startsWith('.')) continue;
      let userId = known.get(d.name);
      if (!userId) {
        try {
          userId = await resolveUser(d.name);
        } catch (error) {
          logger.warn({ folder: d.name, err: error }, 'body-comp folder import: user lookup failed, will retry on the next scan');
          continue;
        }
        if (!userId) {
          if (!warnedUnknown.has(d.name)) {
            warnedUnknown.add(d.name);
            logger.warn({ folder: d.name }, 'body-comp folder import: no user matches this folder name (username or email), skipping');
          }
          continue;
        }
        known.set(d.name, userId);
        warnedUnknown.delete(d.name);
        logger.info({ folder: d.name, userId }, 'body-comp folder import: folder mapped to a user');
      }
      entries.push({ folder: d.name, userId });
    }
    return entries;
  };

  const scanAll = async () => {
    const entries = await currentEntries();
    for (const entry of entries) watchFolder(entry);
    await Promise.all(entries.map(scan));
  };

  // In per-user mode, watch the root too: a new user's folder is found as
  // soon as it appears, not only on the next rescan.
  if (perUser) {
    try {
      const rootWatcher = fs.watch(root, () => {
        debounce('\0root', () => { lastScan = scanAll(); });
      });
      rootWatcher.on('error', (error) => {
        logger.warn({ root, err: error }, 'body-comp folder import: root watch failed, relying on the periodic rescan');
      });
      watchers.set('\0root', rootWatcher);
    } catch (error) {
      logger.warn({ root, code: error?.code }, 'body-comp folder import: cannot watch the import root, relying on the periodic rescan');
    }
  }

  let lastScan = scanAll();
  const rescanTimer = setInterval(() => { lastScan = scanAll(); }, rescanMs);
  rescanTimer.unref();

  logger.info(
    perUser ? { root, mode: 'per-user' } : { root, mode: 'explicit', folders: explicit.map((e) => e.folder) },
    'body-comp folder import: watching',
  );

  return {
    // Resolves once everything queued so far has been processed.
    idle: async () => {
      let scanning;
      do {
        scanning = lastScan;
        await scanning;
      } while (scanning !== lastScan);
      let current;
      do {
        current = queue;
        await current;
      } while (current !== queue);
    },
    stop: async () => {
      stopped = true;
      clearInterval(rescanTimer);
      for (const timer of debounces.values()) clearTimeout(timer);
      debounces.clear();
      for (const watcher of watchers.values()) watcher.close();
      await queue;
    },
  };
}

export default { startBodyCompFolderImport, parseImportFolders, isCandidateFile, processFile };
