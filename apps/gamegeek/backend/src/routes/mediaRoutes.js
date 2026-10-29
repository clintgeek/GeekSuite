/**
 * GET /api/games/:id/media → the detail page's store links, screenshots and
 * trailers (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Media and links).
 *
 *   { links: [{kind, label, url}],
 *     screenshots: [{thumb, full, source}],
 *     videos: [{kind:'steam', title, thumb, hls, mp4, url} | {kind:'youtube', title, youtubeId, thumb, url}],
 *     source, fetchedAt, partial, errors }
 *
 * Auth- and household-scoped like every game route: a malformed id, a
 * missing game and another household's game all answer the same 404.
 * A provider that fails or runs out of time leaves `partial: true` and its
 * name in `errors`; the response is still 200 with whatever did arrive.
 */
import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import Game from '../models/Game.js';
import householdModule from '@geeksuite/schemas/gamegeek/household';
import { getMediaService } from '../media/mediaService.js';

const { resolveHouseholdId } = householdModule;

const ID = /^[0-9a-f]{24}$/i;
const notFound = (res) => res.status(404).json({ message: 'Not found', code: 'NOT_FOUND' });

const router = express.Router();

router.get('/:id/media', authenticate, async (req, res) => {
  const { id } = req.params;
  if (!ID.test(id)) return notFound(res);
  try {
    const game = await Game.findOne({ _id: id, householdId: resolveHouseholdId(req.user) }, { externalIds: 1 }).lean();
    if (!game) return notFound(res);
    const media = await getMediaService().getMedia(game);
    // The server already caches for days; the browser need not keep a copy
    // that would outlive a Find metadata / unlink.
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json(media);
  } catch (err) {
    req.log?.error?.({ err: err?.message }, 'game media failed');
    return res.status(502).json({ message: 'Media unavailable', code: 'MEDIA_UNAVAILABLE' });
  }
});

export default router;
