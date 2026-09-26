/**
 * The bytes this backend owns (DOCS/THINGGEEK_PLAN.md "Files"):
 *
 *   POST /api/things/:id/files       upload a photo or document onto a Thing
 *   GET  /api/files/:fileId          the original
 *   GET  /api/files/:fileId/thumb    its 480 px webp thumbnail
 *
 * Every route sits behind the member gate and scopes by req.householdId.
 * A malformed id, a missing record and another household's record all
 * answer the same 404, so ids cannot be probed.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { z } from 'zod';
import thingConstants from '@geeksuite/schemas/thinggeek/constants';
import { storeFile, HttpError } from '../services/storeFile.js';
import { resolveInside, CONTENT_TYPE_BY_EXT } from '../lib/fileStorage.js';

const { PHOTO_ROLES, DOCUMENT_ROLES, FILE_KINDS, bounds } = thingConstants;

const notFound = (res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Not found' });

const uploadFields = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('photo'),
    role: z.enum(PHOTO_ROLES).default('overview'),
    caption: z.string().trim().max(300).default(''),
  }),
  z.object({
    kind: z.literal('document'),
    role: z.enum(DOCUMENT_ROLES).default('other'),
    title: z.string().trim().max(200).optional(),
  }),
]);

/** Array field + cap per kind. */
const TARGET = {
  photo: { field: 'photos', max: bounds.photosMax.max },
  document: { field: 'documents', max: bounds.documentsMax.max },
};

/** A download name that can't break the header: ASCII, no quotes, right ext. */
export function safeDownloadName(record) {
  const ext = path.extname(record.path || '').slice(1);
  const stem = path.parse(String(record.originalName || '')).name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._ -]/g, '')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 120);
  return `${stem || `thinggeek-${record.kind === 'photo' ? 'photo' : 'document'}`}${ext ? `.${ext}` : ''}`;
}

function isInlineMime(mime) {
  return mime === 'application/pdf' || String(mime).startsWith('image/');
}

/**
 * @param {object} deps
 * @param {object[]} deps.memberGate  [authenticate, requireMember]
 * @param {object} deps.Thing
 * @param {object} deps.ThingFile
 * @param {string} deps.filesRoot     absolute FILES_PATH
 * @param {() => Date} [deps.now]
 */
export function createFileRoutes({ memberGate, Thing, ThingFile, filesRoot, now = () => new Date() }) {
  const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: bounds.fileBytes.max,
      files: 1,
      fields: 10,
      fieldSize: 4 * 1024,
      parts: 12,
    },
  });

  /**
   * The thing must exist in the caller's household and not be in Trash.
   * Checked BEFORE the multipart body is read, so a bad id costs nothing.
   */
  async function loadLiveThing(req, res, next) {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) return notFound(res);
      const thing = await Thing.findOne({ _id: id, householdId: req.householdId, deletedAt: null }, { _id: 1 }).lean();
      if (!thing) return notFound(res);
      return next();
    } catch (err) {
      return next(err);
    }
  }

  function receiveFile(req, res, next) {
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          code: 'FILE_TOO_LARGE',
          message: `Files can be at most ${Math.round(bounds.fileBytes.max / (1024 * 1024))} MB.`,
        });
      }
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Send one file in the "file" field.' });
      }
      return next(err);
    });
  }

  router.post('/things/:id/files', ...memberGate, loadLiveThing, receiveFile, async (req, res, next) => {
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'A file is required.' });
      }
      const parsed = uploadFields.safeParse({ ...req.body });
      if (!parsed.success) {
        return res.status(400).json({
          code: 'VALIDATION_ERROR',
          message: `kind must be one of ${FILE_KINDS.join('|')}, with a valid role.`,
        });
      }
      const fields = parsed.data;
      const { kind } = fields;

      const { record, deduped } = await storeFile({
        buffer: req.file.buffer,
        kind,
        householdId: req.householdId,
        userId: req.user?.id,
        originalName: req.file.originalname,
        root: filesRoot,
        ThingFile,
        now,
        log: req.log,
      });

      const entryId = new mongoose.Types.ObjectId();
      const entry = kind === 'photo'
        ? { _id: entryId, fileId: record._id, role: fields.role, caption: fields.caption }
        : { _id: entryId, fileId: record._id, role: fields.role, title: (fields.title || record.originalName || '').slice(0, 200) };

      // One atomic write: still this household's, still not trashed, and the
      // array below its cap (index max-1 absent ⇔ length < max).
      const { field, max } = TARGET[kind];
      const result = await Thing.updateOne(
        {
          _id: req.params.id,
          householdId: req.householdId,
          deletedAt: null,
          [`${field}.${max - 1}`]: { $exists: false },
        },
        { $push: { [field]: entry } },
      );
      if (!result?.matchedCount) {
        // Either it was trashed/removed since loadLiveThing, or it is full.
        // The stored bytes stay unreferenced; the purge reclaims them.
        const still = await Thing.findOne({ _id: req.params.id, householdId: req.householdId, deletedAt: null }, { _id: 1 }).lean();
        if (!still) return notFound(res);
        return res.status(409).json({
          code: 'LIMIT_REACHED',
          message: `A thing can hold at most ${max} ${field}.`,
        });
      }

      const { _id, ...entryRest } = entry;
      return res.status(201).json({
        file: {
          id: String(record._id),
          kind: record.kind,
          mime: record.mime,
          size: record.size,
          width: record.width ?? null,
          height: record.height ?? null,
        },
        entry: { id: String(_id), ...entryRest, fileId: String(entryRest.fileId) },
        deduped,
      });
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ code: err.code, message: err.message });
      return next(err);
    }
  });

  async function loadFileRecord(req) {
    const { fileId } = req.params;
    if (!mongoose.isValidObjectId(fileId)) return null;
    return ThingFile.findOne({ _id: fileId, householdId: req.householdId }).lean();
  }

  function sendStored(res, relPath, { contentType, disposition, filename }, next) {
    let abs;
    try {
      abs = resolveInside(filesRoot, relPath);
    } catch {
      return notFound(res);
    }
    fs.stat(abs, (statErr, st) => {
      if (statErr || !st.isFile()) return notFound(res);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
      // Record ids are per content (a new upload is a new id), so a URL's
      // bytes never change: cache forever, but only in this user's browser.
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(abs, { cacheControl: false, dotfiles: 'allow' }, (err) => {
        if (err && !res.headersSent) next(err);
      });
    });
    return undefined;
  }

  router.get('/files/:fileId', ...memberGate, async (req, res, next) => {
    try {
      const record = await loadFileRecord(req);
      if (!record) return notFound(res);
      const ext = path.extname(record.path || '').slice(1);
      const contentType = CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';
      return sendStored(res, record.path, {
        contentType,
        disposition: isInlineMime(record.mime) ? 'inline' : 'attachment',
        filename: safeDownloadName(record),
      }, next);
    } catch (err) {
      return next(err);
    }
  });

  router.get('/files/:fileId/thumb', ...memberGate, async (req, res, next) => {
    try {
      const record = await loadFileRecord(req);
      if (!record || !record.thumbPath) return notFound(res);
      const stem = safeDownloadName(record).replace(/\.[^.]+$/, '');
      return sendStored(res, record.thumbPath, {
        contentType: 'image/webp',
        disposition: 'inline',
        filename: `${stem}-thumb.webp`,
      }, next);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export default createFileRoutes;
