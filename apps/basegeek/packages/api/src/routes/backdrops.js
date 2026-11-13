/**
 * /api/backdrops — the suite's wallpapers (DOCS/BACKDROP_SERVICE_PLAN.md).
 *
 * PUBLIC on purpose: the login screen and logged-out StartGeek both show a
 * wallpaper, and these are public stock photos. Read-only; nothing here
 * takes input beyond an id.
 *
 *   GET /api/backdrops                      → the current batch's manifest
 *   GET /api/backdrops/:id/:variant.jpg     → bytes (variant: landscape|portrait)
 *
 * Manifest URLs are paths; clients resolve them against basegeek's origin.
 * Image ids are unique per batch, so the bytes are immutable and cache for a
 * year; the manifest caches for a few minutes so a new batch shows up soon.
 * Cross-origin access (StartGeek's brightness probe) rides the global cors()
 * allow-list in server.js, which already lists start.clintgeek.com.
 */

import express from 'express';
import mongoose from 'mongoose';
import Backdrop from '../models/Backdrop.js';

export const VARIANTS = ['landscape', 'portrait'];

export function createBackdropRouter({ Photos = Backdrop } = {}) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const docs = await Photos.find({}, { batchId: 1, source: 1, credit: 1, createdAt: 1 })
        .sort({ createdAt: -1, _id: 1 })
        .lean();
      // Mid-swap there can be two batches for an instant; serve the newest.
      const batchId = docs[0]?.batchId ?? null;
      const photos = docs
        .filter((d) => d.batchId === batchId)
        .map((d) => {
          const id = String(d._id);
          return {
            id,
            source: d.source,
            credit: d.credit,
            landscape: `/api/backdrops/${id}/landscape.jpg`,
            portrait: `/api/backdrops/${id}/portrait.jpg`,
          };
        });
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ batchId, photos });
    } catch (err) {
      req.log?.error({ err }, '[backdrops] manifest failed');
      res.status(500).json({ error: 'backdrops_unavailable' });
    }
  });

  router.get('/:id/:variant.jpg', async (req, res) => {
    const { id, variant } = req.params;
    if (!VARIANTS.includes(variant) || !mongoose.isValidObjectId(id)) {
      return res.status(404).end();
    }
    try {
      const doc = await Photos.findById(id, { [variant]: 1 }).lean();
      const v = doc?.[variant];
      if (!v?.data) return res.status(404).end();
      const data = Buffer.isBuffer(v.data) ? v.data : Buffer.from(v.data.buffer ?? v.data);
      res.set('Content-Type', v.contentType || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(data);
    } catch (err) {
      req.log?.error({ err }, '[backdrops] image failed');
      res.status(500).end();
    }
  });

  return router;
}

export default createBackdropRouter();
