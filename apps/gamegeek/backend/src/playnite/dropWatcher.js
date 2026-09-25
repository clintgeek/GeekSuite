/**
 * dropWatcher — import Playnite exports that land in a Nextcloud folder, with
 * nobody in the loop. Design record: apps/gamegeek/DOCS/PLAYNITE_IMPORT.md,
 * "Later (decided 2026-09-25)" → "Automatic import from Nextcloud". Modeled on
 * FitnessGeek's body-comp folder importer
 * (DOCS/BODY_COMPOSITION_INTAKE.md §11, bodyCompFolderImportService.js).
 *
 * Chef's Playnite exporter writes automatically, same filename every time,
 * into a per-user Nextcloud folder on the host; the compose mount brings the
 * parent in read-only at `/playnite-drop`. Config, both from `.env.production`:
 *
 *   PLAYNITE_DROP_ROOT=/playnite-drop   (optional — see below)
 *   PLAYNITE_DROP_DISABLED=1            kill switch
 *
 * No env var is required in production: the watcher turns on when
 * PLAYNITE_DROP_ROOT is set OR the default mount path exists, so the compose
 * mount alone is enough. Every subfolder of the root is a user, named with
 * their username or email (case-insensitive); a new user's folder is picked
 * up on the next scan with no config change, and an unknown name is warned
 * about once and skipped.
 *
 * Three triggers, one path:
 *   1. A full scan at boot (server.js, after Mongo connects). Every push to
 *      main restarts the fleet and a watcher can't see files that arrived
 *      while it was down — this scan is the correctness guarantee.
 *   2. `fs.watch` per folder (plus the root, for a new user's folder),
 *      debounced, and a file is read only once it's stable (below).
 *   3. A rescan every 15 minutes, for a watch event that went missing.
 *
 * All three feed ONE queue, so files are imported one at a time; the commit
 * itself is further serialized against the upload route via importLock.js.
 *
 * The folder is never written to. "Already handled" lives in the
 * `PlayniteDropFile` ledger, one row per (userId, relPath), keyed by content
 * hash: a re-scan of the one well-known export path is a cheap no-op until
 * the bytes actually change.
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import Game from '../models/Game.js';
import GamePlayer from '../models/GamePlayer.js';
import Profile from '../models/Profile.js';
import PlayniteDropFile from '../models/PlayniteDropFile.js';
import householdModule from '@geeksuite/schemas/gamegeek/household';
import { parseJsonText, parseExport, PlayniteFileError } from './parse.js';
import { buildPlaynitePlan, commitPlaynitePlan } from './runCommit.js';
import { withImportLock } from './importLock.js';
import { resolveImportUser } from './importUserResolver.js';
import { triggerEnrichment } from '../enrichment/service.js';
import logger from '../lib/logger.js';

const { resolveHouseholdId } = householdModule;

// The compose mount path when no PLAYNITE_DROP_ROOT override is set.
export const DEFAULT_ROOT = '/playnite-drop';
// Purely a display string for the frontend ("watching gamegeek-import/<you>/
// in Nextcloud") — the container's mount root already IS that Nextcloud
// folder, so this prefix names it for a human rather than describing a real
// path inside the container.
export const DROP_DISPLAY_PREFIX = 'gamegeek-import';

const DEBOUNCE_MS = 2_000;
// "Two checks at least 5s apart" (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md).
const SETTLE_INTERVAL_MS = 5_000;
const SETTLE_ATTEMPTS = 3;
const RESCAN_MS = 15 * 60 * 1000;
// Chef's real export is ~761 KB; the upload route caps at 20 MB, so anything
// bigger than that isn't a Playnite export either.
const MAX_BYTES = 20 * 1024 * 1024;

const truthy = (v) => ['1', 'true', 'yes', 'on'].includes(String(v ?? '').trim().toLowerCase());

/** Is this filename worth reading? Only `.json` files; dotfiles never are. */
export function isCandidateFile(filename) {
  if (!filename || filename.startsWith('.')) return false;
  return filename.toLowerCase().endsWith('.json');
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Wait until a file's size+mtime are the same on two checks at least
 * `intervalMs` apart, AND the settled bytes parse as JSON. Nextcloud writes
 * files in place, so a half-written file must be retried rather than
 * ledgered as failed — the JSON.parse is the real gate; matching stat alone
 * isn't proof the write finished.
 *
 * @returns {Promise<{buffer: Buffer, size: number, mtime: Date}|null>} null
 *   when the file never settled, vanished, or never became valid JSON within
 *   the attempt budget — the caller should just try again on the next scan.
 */
export async function waitForStableJson(filePath, { intervalMs = SETTLE_INTERVAL_MS, attempts = SETTLE_ATTEMPTS } = {}) {
  let prev = null;
  for (let i = 0; i < attempts; i += 1) {
    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return null;
    }
    if (prev && prev.size === stat.size && prev.mtimeMs === stat.mtimeMs) {
      let buffer;
      try {
        buffer = await fsp.readFile(filePath);
      } catch {
        return null;
      }
      try {
        JSON.parse(stripBom(buffer.toString('utf8')));
        return { buffer, size: stat.size, mtime: stat.mtime };
      } catch {
        // Stat looked stable but the content isn't valid JSON (yet, or ever)
        // — keep waiting rather than ledgering a half-written file as failed.
      }
    }
    prev = { size: stat.size, mtimeMs: stat.mtimeMs };
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

const sha256Of = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/**
 * Import one candidate file for one user, unless the ledger says its content
 * is already handled. Never throws — every outcome is a return value so a
 * bad file can't take the watcher down.
 *
 * @returns {Promise<'imported'|'skipped-older'|'skipped-duplicate'|'failed'|'unchanged'|'not-ready'>}
 */
export async function processFile({ root, folder, userId, filename, settle, now = () => new Date() }) {
  const relPath = `${folder}/${filename}`;
  const filePath = path.join(root, folder, filename);

  const stable = await waitForStableJson(filePath, settle);
  if (!stable) {
    logger.warn({ userId, relPath }, 'playnite drop import: file never settled or is not valid JSON yet, will retry');
    return 'not-ready';
  }
  const { buffer, size, mtime } = stable;

  if (size > MAX_BYTES) {
    logger.warn({ userId, relPath, size, maxBytes: MAX_BYTES }, 'playnite drop import: file too large to be an export, skipping');
    return 'failed';
  }

  const sha256 = sha256Of(buffer);
  // Cheap fast path: this exact content, at this exact slot, was already
  // looked at (imported, skipped or failed) — nothing to do. This is what
  // makes every 15-minute rescan of an unchanged export a single read.
  const existing = await PlayniteDropFile.findOne({ userId, relPath }).lean();
  if (existing && existing.sha256 === sha256) return 'unchanged';

  const householdId = resolveHouseholdId({ id: userId });
  const base = { householdId, userId, relPath, sha256, size, mtime };

  const ledger = async (fields) => {
    try {
      await PlayniteDropFile.findOneAndUpdate(
        { userId, relPath },
        { $set: { ...base, ...fields, processedAt: now() } },
        { upsert: true },
      );
    } catch (error) {
      logger.error({ ...base, err: error }, 'playnite drop import: failed to record the ledger row');
    }
  };

  let parsed;
  try {
    parsed = parseExport(parseJsonText(buffer));
  } catch (error) {
    const message = error instanceof PlayniteFileError ? error.message : (error?.message || String(error));
    await ledger({ status: 'failed', error: message, generatedAtUtc: null, counts: null });
    logger.warn({ ...base, err: message }, 'playnite drop import: file failed to parse, recorded and not retried until it changes');
    return 'failed';
  }

  const generatedDate = parsed.generatedAtUtc ? new Date(parsed.generatedAtUtc) : null;
  const generatedValid = Boolean(generatedDate && !Number.isNaN(generatedDate.getTime()));

  // Content-identical to a file already imported for this user (this path or
  // another) — never worth a second commit.
  const duplicate = await PlayniteDropFile.findOne({ userId, sha256, status: 'imported' }).lean();
  if (duplicate) {
    await ledger({ status: 'skipped-duplicate', error: null, counts: null, generatedAtUtc: generatedValid ? generatedDate : null });
    return 'skipped-duplicate';
  }

  const profile = await Profile.findOne({ userId }).lean();
  const lastGeneratedAtUtc = profile?.playnite?.lastGeneratedAtUtc ? new Date(profile.playnite.lastGeneratedAtUtc).getTime() : null;
  if (lastGeneratedAtUtc != null && generatedValid && generatedDate.getTime() <= lastGeneratedAtUtc) {
    await ledger({ status: 'skipped-older', error: null, counts: null, generatedAtUtc: generatedDate });
    return 'skipped-older';
  }

  try {
    const counts = await withImportLock(async () => {
      // Hidden games are never imported by the auto path — no setting, no override.
      const plan = await buildPlaynitePlan({
        parsed, householdId, userId, includeHidden: false, now: now(), Game, GamePlayer,
      });
      await commitPlaynitePlan({
        plan, householdId, userId, generatedAtUtc: parsed.generatedAtUtc, source: 'folder', Game, GamePlayer, Profile,
      });
      return plan.counts;
    });
    await ledger({ status: 'imported', error: null, counts, generatedAtUtc: generatedValid ? generatedDate : null });
    triggerEnrichment('playnite-drop-import');
    logger.info({ ...base, counts }, 'playnite drop import: file imported');
    return 'imported';
  } catch (error) {
    await ledger({ status: 'failed', error: error?.message || String(error), counts: null, generatedAtUtc: generatedValid ? generatedDate : null });
    logger.error({ ...base, err: error }, 'playnite drop import: commit failed, recorded and not retried until the file changes');
    return 'failed';
  }
}

// The running watcher, for getPlayniteDropStatus()/folderNameFor() — the
// same module-level-singleton shape as enrichment/service.js's worker.
let current = null;

/**
 * Start the importer. Returns `{ idle, stop }`; a no-op stand-in when the
 * importer is off (disabled, or no root configured or mounted).
 *
 * @param {{root?: string, disabled?: string, rescanMs?: number,
 *   debounceMs?: number, settle?: object,
 *   resolveUser?: (folderName: string) => Promise<string|null>,
 *   defaultRoot?: string}} [options] Defaults come from the environment; the
 *   overrides exist for tests.
 */
export function startPlayniteDropImport({
  root = process.env.PLAYNITE_DROP_ROOT,
  disabled = process.env.PLAYNITE_DROP_DISABLED,
  rescanMs = RESCAN_MS,
  debounceMs = DEBOUNCE_MS,
  settle,
  resolveUser = resolveImportUser,
  defaultRoot = DEFAULT_ROOT,
} = {}) {
  const off = (reason) => {
    logger.info({ reason }, 'playnite drop import: off');
    current = null;
    return { idle: () => Promise.resolve(), stop: async () => {} };
  };

  if (truthy(disabled)) return off('PLAYNITE_DROP_DISABLED is set');

  let resolvedRoot = root;
  if (!resolvedRoot) {
    try {
      resolvedRoot = fs.statSync(defaultRoot).isDirectory() ? defaultRoot : null;
    } catch {
      resolvedRoot = null;
    }
  }
  if (!resolvedRoot) return off('no PLAYNITE_DROP_ROOT and no mounted drop folder');

  let stopped = false;
  let queue = Promise.resolve();
  const queued = new Set();
  const debounces = new Map();
  const watchers = new Map(); // folder name ('\0root' for the root itself) -> fs.FSWatcher
  const known = new Map(); // folder name -> userId
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
      .then(() => (stopped ? null : processFile({ root: resolvedRoot, ...entry, filename, settle })))
      .catch((error) => logger.error({ err: error, folder: entry.folder, filename }, 'playnite drop import: unexpected error'))
      .finally(() => queued.delete(key));
  };

  const scan = async (entry) => {
    let names;
    try {
      names = await fsp.readdir(path.join(resolvedRoot, entry.folder));
    } catch (error) {
      logger.warn({ folder: entry.folder, code: error?.code }, 'playnite drop import: cannot read folder');
      return;
    }
    for (const name of names.sort()) enqueue(entry, name);
  };

  const watchFolder = (entry) => {
    if (stopped || watchers.has(entry.folder)) return;
    try {
      const watcher = fs.watch(path.join(resolvedRoot, entry.folder), (_event, filename) => {
        if (!filename) return;
        const name = filename.toString();
        debounce(`${entry.folder}/${name}`, () => enqueue(entry, name));
      });
      watcher.on('error', (error) => {
        logger.warn({ folder: entry.folder, err: error }, 'playnite drop import: watch failed, relying on the periodic rescan');
      });
      watchers.set(entry.folder, watcher);
    } catch (error) {
      logger.warn({ folder: entry.folder, code: error?.code }, 'playnite drop import: cannot watch folder, relying on the periodic rescan');
    }
  };

  // The folders to import from right now: every subfolder of the root that
  // resolves to a user (§ per-user mapping — no explicit-list mode here,
  // unlike FitnessGeek's, since Chef's exporter always names the folder for
  // the account it belongs to).
  const currentEntries = async () => {
    let dirents;
    try {
      dirents = await fsp.readdir(resolvedRoot, { withFileTypes: true });
    } catch (error) {
      logger.warn({ root: resolvedRoot, code: error?.code }, 'playnite drop import: cannot read the drop root');
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
          logger.warn({ folder: d.name, err: error }, 'playnite drop import: user lookup failed, will retry on the next scan');
          continue;
        }
        if (!userId) {
          if (!warnedUnknown.has(d.name)) {
            warnedUnknown.add(d.name);
            logger.warn({ folder: d.name }, 'playnite drop import: no user matches this folder name (username or email), skipping');
          }
          continue;
        }
        known.set(d.name, userId);
        warnedUnknown.delete(d.name);
        logger.info({ folder: d.name, userId }, 'playnite drop import: folder mapped to a user');
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

  // Watch the root too: a new user's folder is found as soon as it appears,
  // not only on the next rescan.
  try {
    const rootWatcher = fs.watch(resolvedRoot, () => {
      debounce('\0root', () => { lastScan = scanAll(); });
    });
    rootWatcher.on('error', (error) => {
      logger.warn({ root: resolvedRoot, err: error }, 'playnite drop import: root watch failed, relying on the periodic rescan');
    });
    watchers.set('\0root', rootWatcher);
  } catch (error) {
    logger.warn({ root: resolvedRoot, code: error?.code }, 'playnite drop import: cannot watch the drop root, relying on the periodic rescan');
  }

  let lastScan = scanAll();
  const rescanTimer = setInterval(() => { lastScan = scanAll(); }, rescanMs);
  rescanTimer.unref();

  logger.info({ root: resolvedRoot }, 'playnite drop import: watching');

  const handle = {
    root: resolvedRoot,
    known,
    // Resolves once everything queued so far has been processed.
    idle: async () => {
      let scanning;
      do {
        scanning = lastScan;
        await scanning;
      } while (scanning !== lastScan);
      let curr;
      do {
        curr = queue;
        await curr;
      } while (curr !== queue);
    },
    stop: async () => {
      stopped = true;
      clearInterval(rescanTimer);
      for (const timer of debounces.values()) clearTimeout(timer);
      debounces.clear();
      for (const watcher of watchers.values()) watcher.close();
      await queue;
      if (current === handle) current = null;
    },
  };
  current = handle;
  return handle;
}

/** `{ enabled }` — whether the importer is running at all right now. */
export function getPlayniteDropStatus() {
  return { enabled: Boolean(current) };
}

/** The folder name currently mapped to this user, or null if none is (yet). */
export function folderNameFor(userId) {
  if (!current) return null;
  for (const [folder, uid] of current.known) if (uid === userId) return folder;
  return null;
}

export default {
  startPlayniteDropImport, getPlayniteDropStatus, folderNameFor,
  isCandidateFile, waitForStableJson, processFile,
  DEFAULT_ROOT, DROP_DISPLAY_PREFIX,
};
