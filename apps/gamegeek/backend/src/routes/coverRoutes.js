import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import fs from 'node:fs';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import Game from '../models/Game.js';
import householdModule from '@geeksuite/schemas/gamegeek/household';
import { sniffCoverImage } from '../lib/imageSniff.js';
import {
  CONTENT_TYPE_BY_EXT,
  resolveCoverPath,
  ensureCoversDir,
  deleteCoverFileQuiet,
} from '../lib/coverStorage.js';
import { fetchImageBuffer } from '../lib/coverFetch.js';
import { COVER_HOSTS } from '../metadata/coverHosts.js';

const { resolveHouseholdId } = householdModule;

const router = express.Router();

// Content-Type is client-supplied and never trusted on its own — this filter
// is a cheap early rejection; sniffCoverImage() on the actual bytes is what
// decides. Path: multer buffers to memory (≤8MB) so a rejected/invalid file
// never touches disk.
const ALLOWED_UPLOAD_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'cover'));
    }
    return cb(null, true);
  },
});

const fetchBodySchema = z.object({ url: z.string().url() });

function extOf(filename) {
  return String(filename).split('.').pop();
}

/**
 * Load the game `:id` scoped to the caller's household — never trusting a
 * client-supplied householdId (DOCS/GameGeekPlan.md §2.1a). A malformed id,
 * a missing game, or a game outside this household all answer identically
 * (404), so a cover URL cannot be used to probe another household's ids.
 */
async function loadHouseholdGame(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ message: 'Not found', code: 'NOT_FOUND' });
    return null;
  }
  const householdId = resolveHouseholdId(req.user);
  const game = await Game.findOne({ _id: id, householdId });
  if (!game) {
    res.status(404).json({ message: 'Not found', code: 'NOT_FOUND' });
    return null;
  }
  return game;
}

router.get('/:id/cover', authenticate, async (req, res) => {
  const game = await loadHouseholdGame(req, res);
  if (!game) return;
  if (!game.coverPath) return res.status(404).json({ message: 'No cover', code: 'NOT_FOUND' });

  const ext = extOf(game.coverPath);
  let filePath;
  try {
    filePath = resolveCoverPath(game.id, ext);
  } catch {
    return res.status(404).json({ message: 'No cover', code: 'NOT_FOUND' });
  }
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'No cover', code: 'NOT_FOUND' });

  // Cache-busting is the caller's job (`?v=` on the URL, per the plan) — the
  // header below can be `immutable` because a changed cover gets a changed
  // query string, never a rewrite of the same URL.
  res.setHeader('Content-Type', CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(filePath);
});

/**
 * Write a cover buffer for `game`, sniffed rather than trusted. Deletes the
 * previous cover file when its extension differs (a PNG replaced by a JPEG
 * must not leave the old PNG behind). Returns the sniffed `{mimeType, ext}`,
 * or null when the buffer isn't a recognized image — callers turn that into
 * a 400 without having written anything.
 */
async function saveCoverBuffer(game, buffer) {
  const sniffed = sniffCoverImage(buffer);
  if (!sniffed) return null;

  ensureCoversDir();
  const newFilename = `${game.id}.${sniffed.ext}`;
  const newPath = resolveCoverPath(game.id, sniffed.ext);
  const oldFilename = game.coverPath;

  fs.writeFileSync(newPath, buffer);

  if (oldFilename && oldFilename !== newFilename) {
    try {
      deleteCoverFileQuiet(resolveCoverPath(game.id, extOf(oldFilename)));
    } catch {
      // Old filename didn't resolve to a safe path — nothing to clean up.
    }
  }

  game.coverPath = newFilename; // `timestamps: true` bumps updatedAt on save.
  await game.save();
  return sniffed;
}

router.post('/:id/cover', authenticate, upload.single('cover'), async (req, res) => {
  const game = await loadHouseholdGame(req, res);
  if (!game) return;
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ message: 'cover file is required', code: 'VALIDATION_ERROR' });
  }

  const sniffed = await saveCoverBuffer(game, req.file.buffer);
  if (!sniffed) {
    return res.status(400).json({ message: 'cover must be a valid JPEG, PNG, or WebP image', code: 'VALIDATION_ERROR' });
  }
  return res.json({ coverPath: game.coverPath });
});

router.post('/:id/cover/fetch', authenticate, async (req, res) => {
  const game = await loadHouseholdGame(req, res);
  if (!game) return;

  const parsed = fetchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'url is required', code: 'VALIDATION_ERROR' });
  }

  const buffer = await fetchImageBuffer(parsed.data.url, { allowedHosts: COVER_HOSTS, logger: req.log });
  if (!buffer) {
    return res.status(502).json({ message: 'Could not fetch cover image', code: 'COVER_FETCH_FAILED' });
  }

  const sniffed = await saveCoverBuffer(game, buffer);
  if (!sniffed) {
    return res.status(400).json({ message: 'Fetched file is not a valid JPEG, PNG, or WebP image', code: 'VALIDATION_ERROR' });
  }
  return res.json({ coverPath: game.coverPath });
});

router.delete('/:id/cover', authenticate, async (req, res) => {
  const game = await loadHouseholdGame(req, res);
  if (!game) return;

  if (game.coverPath) {
    try {
      deleteCoverFileQuiet(resolveCoverPath(game.id, extOf(game.coverPath)));
    } catch {
      // Stored filename didn't resolve to a safe path — nothing to clean up.
    }
    game.coverPath = null;
    await game.save();
  }
  return res.status(204).end();
});

// Multer's own errors (oversize, rejected mimetype) land here rather than
// falling through to Express's default 500.
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message, code: 'VALIDATION_ERROR' });
  }
  return next(err);
});

export default router;
