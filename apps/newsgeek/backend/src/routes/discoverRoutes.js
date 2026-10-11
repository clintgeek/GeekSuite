import express from 'express';
import { discover, DiscoverInputError } from '../discover/discover.js';
import { UnsafeUrlError, UNSAFE_URL_MESSAGE } from '../lib/safeFetch.js';
import { createRateLimiter } from '../lib/rateLimit.js';

export const DISCOVERIES_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;

/**
 * POST /api/discover — any signed-in user (DOCS/NEWSGEEK_PLAN.md "Discovery").
 * Body `{ url }`. 200 with the plan's shape (`ok:false` + `code` NO_FEED |
 * UNREACHABLE when nothing usable was found); 400 `{ ok:false, code:
 * 'BAD_URL'|'UNSAFE_URL', message }` for the reader's own URL; 429
 * `{ ok:false, code:'RATE_LIMITED', message, retryAfterSec }`.
 *
 * The rate limit is in memory, per process (see ../lib/rateLimit.js): a
 * restart resets it. The fetch used here is fixed at app construction — the
 * request body cannot reach or loosen the SSRF guard.
 *
 * @param {object} deps
 * @param {Array} deps.sessionGate
 * @param {Function} deps.fetchImpl   a safeFetch
 * @param {object} deps.models        { Place, Source }
 * @param {() => number} [deps.clock]
 */
export function createDiscoverRouter({ sessionGate, fetchImpl, models, clock = () => Date.now(), log }) {
  const router = express.Router();
  const limiter = createRateLimiter({ limit: DISCOVERIES_PER_HOUR, windowMs: HOUR_MS, now: clock });

  router.post('/', ...sessionGate, async (req, res, next) => {
    const userId = String(req.user?.id || req.user?._id || '');
    if (!userId) return res.status(401).json({ ok: false, code: 'UNAUTHENTICATED', message: 'Sign in first.' });

    const gate = limiter.take(userId);
    if (!gate.ok) {
      const retryAfterSec = Math.ceil(gate.retryAfterMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        ok: false, code: 'RATE_LIMITED', retryAfterSec,
        message: `That's ${DISCOVERIES_PER_HOUR} lookups this hour. Try again later.`,
      });
    }

    try {
      const body = await discover({ url: req.body?.url, fetchImpl, models, now: () => new Date(clock()) });
      return res.json(body);
    } catch (err) {
      if (err instanceof DiscoverInputError) return res.status(400).json({ ok: false, code: 'BAD_URL', message: err.message });
      if (err instanceof UnsafeUrlError) {
        (req.log || log)?.info({ event: 'discover_refused', reason: err.reason }, 'discovery refused an unsafe url');
        return res.status(400).json({ ok: false, code: 'UNSAFE_URL', message: UNSAFE_URL_MESSAGE });
      }
      return next(err);
    }
  });

  return router;
}

export default createDiscoverRouter;
