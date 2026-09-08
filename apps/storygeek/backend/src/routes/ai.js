/**
 * `/api/ai` — the player's model picker, and nothing else.
 *
 * One route replaced three. What went, and why:
 *
 *   - `GET /gm-config` returned `{ provider, model, freeOnly, fallbacks }`
 *     read out of `STORYGEEK_GM_*` env vars, and the frontend defaulted the
 *     picker to it. Those env vars are gone (Chef's decision D4: nobody types
 *     a model id, including in a consumer env var), and the default is now
 *     **Automatic** — aiGeek's sticky pick per story, which is the thing the
 *     pinned GM model was a hand-rolled approximation of.
 *   - `GET /providers` and `GET /director/models` were an open proxy: they
 *     forwarded the browser's cookie to basegeek from an *unauthenticated*
 *     route, so any anonymous caller who could reach this host could
 *     enumerate the suite's AI providers and their model catalogs. They also
 *     needed the `ai:director` permission, whose absence was once a total
 *     StoryGeek outage.
 *
 * What replaced them: `GET /api/ai/models/alive`, which asks aiGeek's
 * `GET /api/ai/models/alive` (permission `ai:models`) with StoryGeek's own
 * service key and hands back only what a picker needs. The router requires a
 * session, because it now spends this app's credential rather than the
 * caller's.
 */

import express from 'express';
import aiService from '../services/aiService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// This router spends StoryGeek's service key. It must never be reachable
// without a session.
router.use(authenticateToken);

/**
 * The rows the picker offers, alongside its own "Automatic" default.
 *
 * `[]` is a perfectly good answer — the picker shows Automatic alone, which
 * works. So an unreachable aiGeek is a 200 with an empty list and a flag,
 * never a 502 that puts an error state on the settings page.
 */
router.get('/models/alive', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const userToken = authHeader && authHeader.split(' ')[1];

  const models = await aiService.modelsAlive(userToken);

  res.json({
    success: true,
    data: {
      // Automatic is not a row in this list; it is the absence of a pin, and
      // the frontend renders it as the first option.
      models: models.map((row) => ({
        provider: row.provider,
        modelId: row.modelId,
        fitness: row.fitness ?? null,
        paid: !!row.paid,
        lastSuccessAt: row.lastSuccessAt ?? null
      })),
      available: models.length > 0
    }
  });
});

export default router;
