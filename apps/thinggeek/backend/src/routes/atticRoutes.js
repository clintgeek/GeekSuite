/**
 * The Attic's sealed bytes and sealed identifiers (DOCS/THINGGEEK_PLAN.md
 * "The Attic"). Everything here sits behind noStore → memberGate →
 * requireKey → requireVault (middleware/attic.js) and scopes by
 * req.householdId. A malformed id, a missing record, a deleted document and
 * another household's record all answer the same 404.
 *
 *   POST /api/attic/documents/:id/files            add a card side / page (multipart `file`, side, caption)
 *   GET  /api/attic/files/:fileId[?download=1]     the decrypted original (audit: file-view | download)
 *   GET  /api/attic/documents/:id/identifiers/:key one identifier, decrypted (audit: reveal)
 *   PUT  /api/attic/documents/:id/identifiers      seal identifier values { values: { key: string|null } }
 *
 * Plaintext never touches the disk: bytes are sealed in memory (within the
 * 25 MB upload limit) and written already encrypted. No plaintext digest is
 * stored (no cross-household — or any — equality oracle), so there is no
 * dedupe: each upload is its own sealed object, owned by one document.
 */
import fs from 'node:fs';
import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { z } from 'zod';
import thingConstants from '@geeksuite/schemas/thinggeek/constants';
import atticModule from '@geeksuite/schemas/thinggeek/attic';
import { sniffFile } from '../lib/fileSniff.js';
import { resolveInside, writeFileAtomic } from '../lib/fileStorage.js';
import { AtticCryptoError } from '../lib/atticCrypto.js';
import { auditEntry } from '../middleware/attic.js';

const { bounds } = thingConstants;
const { ATTIC_FILE_SIDES, atticBounds } = atticModule;

/** Card photos and scanned pages. No plain text: a document's words belong in its fields. */
export const ATTIC_MIMES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
const EXT_BY_MIME = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' });
const NORMALIZE = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;
const HOUSEHOLD_RE = /^[A-Za-z0-9_-]{1,64}$/;

const notFound = (res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Not found' });

const uploadFields = z.object({
  side: z.enum([...ATTIC_FILE_SIDES]).default('page'),
  caption: z.string().trim().max(200).default(''),
}).strict();

const identifiersBody = z.object({
  values: z.record(
    z.string().regex(FIELD_KEY),
    z.string().trim().max(atticBounds.identifierValue.maxlength).nullable(),
  ),
}).strict();

/** Where a sealed file lives, relative to FILES_PATH. Validated parts only. */
export function atticRelPath({ householdId, fileId, date = new Date() }) {
  if (!HOUSEHOLD_RE.test(String(householdId)) || !/^[0-9a-f]{24}$/.test(String(fileId))) throw new Error('bad attic path parts');
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${householdId}/attic/${yyyy}/${mm}/${fileId}.enc`;
}

/**
 * Bake the orientation in and drop every metadata block (EXIF GPS: where the
 * house is) from a JPEG/PNG/WebP before it is sealed. HEIC and PDF are kept
 * as uploaded. Never fails an upload: an image sharp can't read is kept as is.
 */
async function normalizeImage(buffer, mime) {
  if (!NORMALIZE.has(mime)) return { buffer, width: null, height: null };
  try {
    let img = sharp(buffer, { failOn: 'none' }).rotate();
    if (mime === 'image/jpeg') img = img.jpeg({ quality: 92, mozjpeg: true });
    else if (mime === 'image/png') img = img.png();
    else img = img.webp({ quality: 92 });
    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width ?? null, height: info.height ?? null };
  } catch {
    return { buffer, width: null, height: null };
  }
}

/**
 * @param {object} deps
 * @param {Function[]} deps.guards      [noStore, ...memberGate, requireKey, requireVault]
 * @param {object} deps.keyring
 * @param {object} deps.models          { AtticDocument, AtticDocumentType, AtticFile, AtticAudit }
 * @param {string} deps.filesRoot
 * @param {() => Date} [deps.now]
 */
export function createAtticRoutes({ guards, keyring, models, filesRoot, now = () => new Date() }) {
  const { AtticDocument, AtticDocumentType, AtticFile, AtticAudit } = models;
  const router = express.Router();
  const audit = (req, entry) => AtticAudit.create(auditEntry(req, now, entry));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: bounds.fileBytes.max, files: 1, fields: 6, fieldSize: 1024, parts: 8 },
  });

  async function loadLiveDocument(req, res, next) {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) return notFound(res);
      const doc = await AtticDocument.findOne({ _id: id, householdId: req.householdId, deletedAt: null }).lean();
      if (!doc) return notFound(res);
      req.atticDocument = doc;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  function receiveFile(req, res, next) {
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ code: 'FILE_TOO_LARGE', message: `Files can be at most ${Math.round(bounds.fileBytes.max / (1024 * 1024))} MB.` });
      }
      if (err instanceof multer.MulterError) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Send one file in the "file" field.' });
      return next(err);
    });
  }

  router.post('/documents/:id/files', ...guards, loadLiveDocument, receiveFile, async (req, res, next) => {
    try {
      if (!req.file?.buffer?.length) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'A file is required.' });
      const parsed = uploadFields.safeParse({ ...req.body });
      if (!parsed.success) return res.status(400).json({ code: 'VALIDATION_ERROR', message: `side must be one of ${ATTIC_FILE_SIDES.join('|')}.` });
      const sniffed = sniffFile(req.file.buffer);
      if (!sniffed || !ATTIC_MIMES.includes(sniffed.mime)) {
        return res.status(415).json({ code: 'UNSUPPORTED_TYPE', message: 'The Attic takes photos (JPEG, PNG, WebP, HEIC) and PDFs.' });
      }

      const { buffer, width, height } = await normalizeImage(req.file.buffer, sniffed.mime);
      const fileId = new mongoose.Types.ObjectId();
      const rel = atticRelPath({ householdId: req.householdId, fileId: String(fileId), date: now() });
      // Sealed in memory; only ciphertext is ever written.
      const sealed = keyring.sealFile({ householdId: req.householdId, fileId: String(fileId), buffer });
      await writeFileAtomic(filesRoot, rel, sealed);
      await AtticFile.create({
        _id: fileId,
        householdId: req.householdId,
        documentId: req.atticDocument._id,
        mime: sniffed.mime,
        size: buffer.length,
        path: rel,
        keyVersion: keyring.version,
        width,
        height,
        uploadedBy: String(req.user.id),
      });

      const entryId = new mongoose.Types.ObjectId();
      const entry = { _id: entryId, fileId, side: parsed.data.side, caption: parsed.data.caption };
      const max = atticBounds.filesPerDocument.max;
      const result = await AtticDocument.updateOne(
        { _id: req.atticDocument._id, householdId: req.householdId, deletedAt: null, [`files.${max - 1}`]: { $exists: false } },
        { $push: { files: entry } },
      );
      if (!result?.matchedCount) {
        // Deleted meanwhile, or full. The sealed bytes stay unreferenced; the purge reclaims them.
        const still = await AtticDocument.findOne({ _id: req.atticDocument._id, householdId: req.householdId, deletedAt: null }, { _id: 1 }).lean();
        if (!still) return notFound(res);
        return res.status(409).json({ code: 'LIMIT_REACHED', message: `A document can hold at most ${max} files.` });
      }
      await audit(req, { action: 'upload', documentId: req.atticDocument._id, fileId });
      return res.status(201).json({
        file: { id: String(fileId), mime: sniffed.mime, size: buffer.length, width, height },
        entry: { id: String(entryId), fileId: String(fileId), side: entry.side, caption: entry.caption },
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get('/files/:fileId', ...guards, async (req, res, next) => {
    try {
      const { fileId } = req.params;
      if (!mongoose.isValidObjectId(fileId)) return notFound(res);
      const record = await AtticFile.findOne({ _id: fileId, householdId: req.householdId }).lean();
      if (!record) return notFound(res);
      // Only a file a LIVE document still holds: a deleted document's pages are gone at once.
      const owner = await AtticDocument.exists({ _id: record.documentId, householdId: req.householdId, deletedAt: null, 'files.fileId': record._id });
      if (!owner) return notFound(res);
      let abs;
      try {
        abs = resolveInside(filesRoot, record.path);
      } catch {
        return notFound(res);
      }
      let sealed;
      try {
        sealed = await fs.promises.readFile(abs);
      } catch {
        return notFound(res);
      }
      let plain;
      try {
        plain = keyring.openFile({ householdId: req.householdId, fileId: String(record._id), sealed });
      } catch (err) {
        if (err instanceof AtticCryptoError) {
          req.log?.error({ event: 'attic_file_unreadable' }, 'an Attic file failed to open');
          return res.status(500).json({ code: 'ATTIC_UNREADABLE', message: 'This file could not be opened.' });
        }
        throw err;
      }
      const download = req.query.download === '1';
      await audit(req, { action: download ? 'download' : 'file-view', documentId: record.documentId, fileId: record._id });
      const ext = EXT_BY_MIME[record.mime] || 'bin';
      res.setHeader('Content-Type', EXT_BY_MIME[record.mime] ? record.mime : 'application/octet-stream');
      res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="thinggeek-attic.${ext}"`);
      res.setHeader('Content-Length', String(plain.length));
      return res.status(200).end(plain);
    } catch (err) {
      return next(err);
    }
  });

  async function identifierFieldsOf(req) {
    const type = await AtticDocumentType.findOne({ _id: req.atticDocument.typeId, householdId: req.householdId }).lean();
    return new Map((type?.fields ?? []).filter((f) => f.identifier && FIELD_KEY.test(f.key)).map((f) => [f.key, f]));
  }

  router.get('/documents/:id/identifiers/:key', ...guards, loadLiveDocument, async (req, res, next) => {
    try {
      const { key } = req.params;
      const fields = await identifierFieldsOf(req);
      if (!fields.has(key)) return notFound(res);
      const sealed = req.atticDocument.secrets?.[key];
      if (!sealed?.ct) return res.json({ key, value: null });
      let value;
      try {
        value = keyring.openField({ householdId: req.householdId, documentId: String(req.atticDocument._id), key, sealed });
      } catch (err) {
        if (err instanceof AtticCryptoError) {
          req.log?.error({ event: 'attic_field_unreadable' }, 'an Attic value failed to open');
          return res.status(500).json({ code: 'ATTIC_UNREADABLE', message: 'This value could not be opened.' });
        }
        throw err;
      }
      await audit(req, { action: 'reveal', documentId: req.atticDocument._id, field: key });
      return res.json({ key, value });
    } catch (err) {
      return next(err);
    }
  });

  router.put('/documents/:id/identifiers', ...guards, loadLiveDocument, async (req, res, next) => {
    try {
      const parsed = identifiersBody.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Send { values: { fieldKey: "value" | null } }.' });
      const fields = await identifierFieldsOf(req);
      const unknown = Object.keys(parsed.data.values).filter((k) => !fields.has(k));
      if (unknown.length) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Only this document type’s identifier fields can be set here.', fields: unknown });
      const $set = {};
      const $unset = {};
      for (const [key, raw] of Object.entries(parsed.data.values)) {
        if (raw === null || raw === '') $unset[`secrets.${key}`] = '';
        else $set[`secrets.${key}`] = keyring.sealField({ householdId: req.householdId, documentId: String(req.atticDocument._id), key, plaintext: raw });
      }
      const update = {};
      if (Object.keys($set).length) update.$set = $set;
      if (Object.keys($unset).length) update.$unset = $unset;
      if (Object.keys(update).length) {
        const r = await AtticDocument.updateOne({ _id: req.atticDocument._id, householdId: req.householdId, deletedAt: null }, update);
        if (!r?.matchedCount) return notFound(res);
        for (const key of Object.keys(parsed.data.values)) {
          await audit(req, { action: 'identifiers-set', documentId: req.atticDocument._id, field: key });
        }
      }
      const fresh = await AtticDocument.findOne({ _id: req.atticDocument._id, householdId: req.householdId }, { secrets: 1 }).lean();
      return res.json({
        identifiers: [...fields.keys()].map((key) => ({ key, hasValue: Boolean(fresh?.secrets?.[key]?.ct) })),
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

export default createAtticRoutes;
