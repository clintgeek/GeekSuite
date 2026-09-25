/**
 * POST /api/import/playnite — import a Playnite Library Exporter file
 * (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md).
 *
 * Body: multipart field `file`, or `application/json` holding the export.
 * Flags (query or multipart fields): `dryRun` (default true), `includeHidden`
 * (default false). Household-scoped via resolveHouseholdId(req.user).
 *
 * Order matters: auth runs BEFORE the 20 MB body is read, so an anonymous
 * caller can't make this process buffer and parse a large upload. app.js
 * skips its default (100 kB) JSON parser for this one path; the larger limit
 * lives here and nowhere else.
 */
import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authMiddleware.js';
import Game from '../models/Game.js';
import GamePlayer from '../models/GamePlayer.js';
import Profile from '../models/Profile.js';
import PlayniteDropFile from '../models/PlayniteDropFile.js';
import householdModule from '@geeksuite/schemas/gamegeek/household';
import { parseExport, parseJsonText, PlayniteFileError } from '../playnite/parse.js';
import { buildPlaynitePlan, commitPlaynitePlan } from '../playnite/runCommit.js';
import { withImportLock } from '../playnite/importLock.js';
import { getPlayniteDropStatus, folderNameFor, DROP_DISPLAY_PREFIX } from '../playnite/dropWatcher.js';
import { triggerEnrichment } from '../enrichment/service.js';

const { resolveHouseholdId } = householdModule;

export const PLAYNITE_IMPORT_PATH = '/api/import/playnite';
export const PLAYNITE_MAX_BYTES = 20 * 1024 * 1024;

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PLAYNITE_MAX_BYTES, files: 1, fields: 10 },
});
const jsonBody = express.json({ limit: PLAYNITE_MAX_BYTES });

const tooLarge = (res) =>
  res.status(413).json({ message: 'That file is larger than 20 MB', code: 'PLAYNITE_TOO_LARGE' });
const badFile = (res, message = 'That is not a Playnite library export') =>
  res.status(400).json({ message, code: 'PLAYNITE_BAD_FILE' });

/** Multipart → multer; anything else → the route-scoped JSON parser. Maps parser errors to the documented codes. */
function readBody(req, res, next) {
  const parser = req.is('multipart/form-data') ? upload.single('file') : jsonBody;
  parser(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE' || err.type === 'entity.too.large' || err.status === 413) return tooLarge(res);
    if (err.type === 'entity.parse.failed') return badFile(res, 'That file is not valid JSON');
    if (err instanceof multer.MulterError) return badFile(res, 'Upload a single file in the `file` field');
    return next(err);
  });
}

/** `true`/`'true'`/`'1'`/`'yes'` → true; `false`/`'false'`/`'0'`/`'no'` → false; else the default. */
export function parseFlag(value, fallback) {
  if (Array.isArray(value)) value = value[value.length - 1];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'off'].includes(v)) return false;
  }
  return fallback;
}

router.post('/playnite', authenticate, readBody, async (req, res, next) => {
  const isMultipart = req.is('multipart/form-data');
  const fields = isMultipart ? req.body ?? {} : {};
  const dryRun = parseFlag(req.query.dryRun ?? fields.dryRun, true);
  const includeHidden = parseFlag(req.query.includeHidden ?? fields.includeHidden, false);

  let parsed;
  try {
    let json;
    if (isMultipart) {
      if (!req.file?.buffer?.length) return badFile(res, 'Choose a Playnite export file to upload');
      json = parseJsonText(req.file.buffer);
    } else {
      if (!req.is('application/json')) return badFile(res, 'Send the export as a `file` upload or as JSON');
      json = req.body;
    }
    parsed = parseExport(json);
  } catch (err) {
    if (err instanceof PlayniteFileError) return badFile(res, err.message);
    return next(err);
  }

  const householdId = resolveHouseholdId(req.user);
  const userId = req.user.id;

  try {
    const plan = await buildPlaynitePlan({
      parsed, householdId, userId, includeHidden, now: new Date(), Game, GamePlayer,
    });

    const body = {
      schemaVersion: parsed.schemaVersion,
      generatedAtUtc: parsed.generatedAtUtc,
      total: plan.total,
      counts: plan.counts,
      samples: plan.samples,
      committed: false,
    };
    if (dryRun) return res.json(body);

    // Serialized against the Nextcloud drop watcher (importLock.js) — an
    // upload landing mid-drop-import must not interleave writes with it.
    await withImportLock(() =>
      commitPlaynitePlan({
        plan, householdId, userId, generatedAtUtc: parsed.generatedAtUtc, source: 'upload', Game, GamePlayer, Profile,
      })
    );

    // New games want covers and metadata; the worker runs in the background.
    triggerEnrichment('playnite-commit');

    return res.json({ ...body, committed: true });
  } catch (err) {
    req.log?.error?.({ err: err?.message }, 'playnite import failed');
    return res.status(500).json({ message: 'Playnite import failed', code: 'PLAYNITE_IMPORT_ERROR' });
  }
});

/**
 * GET /api/import/playnite/drop/status — the Nextcloud auto-import's state
 * for the calling user (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md, folder
 * import). Household-scoped by construction: the ledger row and the profile
 * stamp are both keyed by this user's own id.
 */
router.get('/playnite/drop/status', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { enabled } = getPlayniteDropStatus();
    const username = req.user.username || req.user.email || null;
    const folder = enabled && username ? `${DROP_DISPLAY_PREFIX}/${username}/` : null;
    const watching = enabled && Boolean(folderNameFor(userId));

    const row = await PlayniteDropFile.findOne({ userId }).sort({ processedAt: -1 }).lean();
    const lastFile = row
      ? {
          name: row.relPath ? row.relPath.split('/').pop() : null,
          status: row.status,
          processedAt: row.processedAt ?? null,
          generatedAtUtc: row.generatedAtUtc ?? null,
          counts: row.counts ?? null,
          error: row.error ?? null,
        }
      : null;

    return res.json({ enabled, watching, folder, lastFile });
  } catch (err) {
    req.log?.error?.({ err: err?.message }, 'playnite drop status failed');
    return res.status(500).json({ message: 'Could not read the Playnite auto-import status', code: 'PLAYNITE_DROP_STATUS_ERROR' });
  }
});

export default router;
