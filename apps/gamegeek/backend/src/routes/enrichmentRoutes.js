/**
 * Metadata enrichment endpoints (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Endpoints).
 * Every route needs a session and is scoped to the caller's household;
 * POSTs go through app.js's csrfGuard like every other write.
 *
 *   enrichmentRouter    mounted at /api/metadata/enrich
 *     GET  /status
 *     POST /run                          → 202 {started, reason?}
 *   gameMetadataRouter  mounted at /api/games
 *     POST /:id/metadata/refresh         → {outcome, enrichment}
 *     GET  /:id/metadata/candidates      → {candidates: [...], errors: [...]}
 *     POST /:id/metadata/apply {provider, providerId} → {enrichment}
 *     POST /:id/metadata/unlink          → {enrichment, cleared, kept}
 */
import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import householdModule from '@geeksuite/schemas/gamegeek/household';
import { getEnrichmentDeps, getEnrichmentWorker } from '../enrichment/service.js';
import { enrichGame, applyCandidate, unlinkGame, listCandidates } from '../enrichment/enrichGame.js';

const { resolveHouseholdId } = householdModule;

const idParamSchema = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i) });
const applyBodySchema = z.object({
  provider: z.enum(['steam', 'igdb', 'rawg']),
  providerId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d{1,12}$/)),
});

const notFound = (res) => res.status(404).json({ message: 'Not found', code: 'NOT_FOUND' });
const upstream = (res) =>
  res.status(502).json({ message: 'Metadata provider unavailable', code: 'METADATA_UPSTREAM_ERROR' });

/** What the API exposes of Game.enrichment — the unlink fingerprints stay server-side. */
export function publicEnrichment(e) {
  if (!e) return null;
  return {
    status: e.status ?? 'pending',
    provider: e.provider ?? null,
    providerId: e.providerId ?? null,
    matchedTitle: e.matchedTitle ?? null,
    matchedAt: e.matchedAt ?? null,
    manual: Boolean(e.manual),
    attempts: e.attempts ?? 0,
    lastTriedAt: e.lastTriedAt ?? null,
    error: e.error ?? null,
    filled: e.filled ?? [],
    coverFromEnrichment: Boolean(e.coverFromEnrichment),
    providersTried: e.providersTried ?? [],
  };
}

export const enrichmentRouter = express.Router();

enrichmentRouter.get('/status', authenticate, async (req, res) => {
  try {
    return res.json(await getEnrichmentWorker().status(resolveHouseholdId(req.user)));
  } catch (err) {
    req.log?.error?.({ err: err?.message }, 'enrichment status failed');
    return res.status(500).json({ message: 'Could not read enrichment status', code: 'ENRICHMENT_STATUS_ERROR' });
  }
});

enrichmentRouter.post('/run', authenticate, (req, res) => {
  const result = getEnrichmentWorker().run({ trigger: 'api' });
  return res.status(202).json(result);
});

export const gameMetadataRouter = express.Router();

/** `{_id, householdId}` for `:id` in the caller's household, or null (a 404 was sent). */
async function gameRef(req, res) {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) {
    notFound(res);
    return null;
  }
  const householdId = resolveHouseholdId(req.user);
  const { Game } = getEnrichmentDeps();
  const game = await Game.findOne({ _id: parsed.data.id, householdId }).lean();
  if (!game) {
    notFound(res);
    return null;
  }
  return game;
}

gameMetadataRouter.post('/:id/metadata/refresh', authenticate, async (req, res) => {
  const game = await gameRef(req, res);
  if (!game) return;
  try {
    const { outcome, enrichment } = await enrichGame(game, getEnrichmentDeps(), { mode: 'refresh' });
    if (outcome === 'missing') return notFound(res);
    return res.json({ outcome, enrichment: publicEnrichment(enrichment) });
  } catch (err) {
    req.log?.error?.({ err: err?.message }, 'enrichment refresh failed');
    return upstream(res);
  }
});

gameMetadataRouter.get('/:id/metadata/candidates', authenticate, async (req, res) => {
  const game = await gameRef(req, res);
  if (!game) return;
  try {
    return res.json(await listCandidates(game, getEnrichmentDeps()));
  } catch (err) {
    req.log?.error?.({ err: err?.message }, 'enrichment candidates failed');
    return upstream(res);
  }
});

gameMetadataRouter.post('/:id/metadata/apply', authenticate, async (req, res) => {
  const body = applyBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    return res.status(400).json({ message: 'provider (steam|igdb|rawg) and a numeric providerId are required', code: 'VALIDATION_ERROR' });
  }
  const game = await gameRef(req, res);
  if (!game) return;
  try {
    const result = await applyCandidate(game, body.data, getEnrichmentDeps());
    if (result.error === 'provider-unavailable') {
      return res.status(400).json({ message: `The server has no ${body.data.provider} key configured`, code: 'PROVIDER_NOT_CONFIGURED' });
    }
    if (result.error === 'not-found') return notFound(res);
    if (result.error === 'candidate-not-found') {
      return res.status(404).json({ message: 'That candidate no longer exists at the provider', code: 'CANDIDATE_NOT_FOUND' });
    }
    if (result.error) return res.status(409).json({ message: 'The game changed while applying; try again', code: 'CONFLICT' });
    return res.json({ enrichment: publicEnrichment(result.enrichment) });
  } catch (err) {
    req.log?.error?.({ err: err?.message }, 'enrichment apply failed');
    return upstream(res);
  }
});

gameMetadataRouter.post('/:id/metadata/unlink', authenticate, async (req, res) => {
  const game = await gameRef(req, res);
  if (!game) return;
  try {
    const result = await unlinkGame(game, getEnrichmentDeps());
    if (!result) return res.status(409).json({ message: 'The game changed while unlinking; try again', code: 'CONFLICT' });
    return res.json({ enrichment: publicEnrichment(result.enrichment), cleared: result.cleared, kept: result.kept });
  } catch (err) {
    req.log?.error?.({ err: err?.message }, 'enrichment unlink failed');
    return res.status(500).json({ message: 'Unlink failed', code: 'ENRICHMENT_UNLINK_ERROR' });
  }
});

export default { enrichmentRouter, gameMetadataRouter, publicEnrichment };
