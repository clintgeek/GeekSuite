import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { isIgdbConfigured, searchIgdbGames } from '../metadata/igdbClient.js';
import { normalizeIgdbSearchResults } from '../metadata/igdb.js';
import { searchSteamStore, fetchSteamAppDetails } from '../metadata/steamClient.js';
import { normalizeSteamSearchResults, normalizeSteamAppDetails } from '../metadata/steam.js';
import { isSteamImportConfigured } from '../metadata/steamWebApi.js';

const router = express.Router();

const DEFAULT_SEARCH_LIMIT = 10;

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const steamAppIdParamSchema = z.object({
  appId: z.string().regex(/^\d+$/, 'appId must be digits only'),
});

router.get('/providers', authenticate, (req, res) => {
  res.json({
    igdb: isIgdbConfigured(),
    steamStore: true,
    steamImport: isSteamImportConfigured(),
  });
});

router.get('/search', authenticate, async (req, res) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: 'q is required (1-100 chars); limit must be 1-20', code: 'VALIDATION_ERROR' });
  }
  const { q, limit } = parsed.data;
  const effectiveLimit = limit ?? DEFAULT_SEARCH_LIMIT;

  try {
    if (isIgdbConfigured()) {
      const raw = await searchIgdbGames(q, effectiveLimit);
      return res.json({ provider: 'igdb', results: normalizeIgdbSearchResults(raw) });
    }

    const raw = await searchSteamStore(q);
    const results = normalizeSteamSearchResults(raw).slice(0, effectiveLimit);
    return res.json({ provider: 'steam-store', results });
  } catch (err) {
    req.log?.error?.({ err: err?.message }, 'metadata search failed');
    return res.status(502).json({ message: 'Metadata provider unavailable', code: 'METADATA_UPSTREAM_ERROR' });
  }
});

router.get('/steam/:appId', authenticate, async (req, res) => {
  const parsed = steamAppIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    return res.status(400).json({ message: 'appId must be digits only', code: 'VALIDATION_ERROR' });
  }

  try {
    const raw = await fetchSteamAppDetails(parsed.data.appId);
    const candidate = normalizeSteamAppDetails(parsed.data.appId, raw);
    if (!candidate) {
      return res.status(404).json({ message: 'Steam app not found', code: 'NOT_FOUND' });
    }
    return res.json(candidate);
  } catch (err) {
    req.log?.error?.({ err: err?.message }, 'steam appdetails failed');
    return res.status(502).json({ message: 'Steam store unavailable', code: 'METADATA_UPSTREAM_ERROR' });
  }
});

export default router;
