/**
 * /api/connections — household OAuth connections
 *
 * See PLAN.md "Auth rework — OAuth-via-Mongo" for the contract.
 *
 * Endpoints:
 *   GET  /                              SSO-required   → listConnections
 *   GET  /:provider/authorize           SSO-required   → { url }
 *   GET  /:provider/callback            public         → provider redirect
 *   POST /:provider/disconnect          SSO-required   → disconnect
 *   POST /internal/token                service JWT    → { accessToken }
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';
import {
  getAuthorizeUrl,
  handleCallback,
  getFreshAccessToken,
  listConnections,
  disconnect,
  getProviderConfig,
  ProviderExpiredError,
  InvalidStateError,
} from '../services/oauthConnectionService.js';
import logger from '../lib/logger.js';

const router = express.Router();

// --- helpers ---------------------------------------------------------------

function validateProvider(req, res) {
  try {
    getProviderConfig(req.params.provider);
    return true;
  } catch {
    res.status(404).json({ error: 'unknown_provider' });
    return false;
  }
}

function requireInternalToken(req, res, next) {
  const secret = process.env.INTERNAL_JWT_SECRET;
  if (!secret) {
    req.log?.error('[connections] INTERNAL_JWT_SECRET not set');
    return res.status(500).json({ error: 'internal_token_misconfigured' });
  }
  const token = req.headers['x-internal-token'];
  if (!token || typeof token !== 'string') {
    return res.status(401).json({ error: 'missing_internal_token' });
  }
  try {
    const decoded = jwt.verify(token, secret);
    req.internal = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid_internal_token' });
  }
}

// --- routes ----------------------------------------------------------------

// GET /api/connections — list current user's providers + status
router.get('/', authenticateToken, async (req, res) => {
  try {
    const rows = await listConnections(req.user.id);
    res.json({ connections: rows });
  } catch (err) {
    req.log.error({ err }, '[connections] list failed');
    res.status(500).json({ error: 'list_failed' });
  }
});

// GET /api/connections/:provider/authorize?return_to=...
router.get('/:provider/authorize', authenticateToken, (req, res) => {
  if (!validateProvider(req, res)) return;
  try {
    const returnTo = typeof req.query.return_to === 'string' ? req.query.return_to : null;
    const { url } = getAuthorizeUrl(req.params.provider, {
      userId: req.user.id,
      returnTo,
    });
    res.json({ url });
  } catch (err) {
    req.log.error({ err }, '[connections] authorize failed');
    res.status(500).json({ error: 'authorize_failed' });
  }
});

// GET /api/connections/:provider/callback — NOT SSO-gated (provider hits this)
router.get('/:provider/callback', async (req, res) => {
  if (!validateProvider(req, res)) return;
  const { code, state, error: providerError } = req.query;

  if (providerError) {
    req.log.warn(
      { provider: req.params.provider, providerError },
      '[connections] provider returned error on callback'
    );
    return res.status(400).json({ error: 'provider_error' });
  }

  if (typeof code !== 'string' || typeof state !== 'string') {
    return res.status(400).json({ error: 'missing_code_or_state' });
  }

  try {
    const { returnTo } = await handleCallback(req.params.provider, {
      code,
      state,
    });
    return res.redirect(returnTo || '/');
  } catch (err) {
    if (err instanceof InvalidStateError) {
      req.log.warn({ err: err.message }, '[connections] state verification failed');
      return res.status(400).json({ error: 'invalid_state' });
    }
    req.log.error({ err }, '[connections] callback failed');
    return res.status(500).json({ error: 'callback_failed' });
  }
});

// POST /api/connections/:provider/disconnect
router.post('/:provider/disconnect', authenticateToken, async (req, res) => {
  if (!validateProvider(req, res)) return;
  try {
    const result = await disconnect(req.user.id, req.params.provider);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, '[connections] disconnect failed');
    res.status(500).json({ error: 'disconnect_failed' });
  }
});

// POST /api/connections/internal/token — service-to-service
router.post('/internal/token', requireInternalToken, async (req, res) => {
  const { userId, provider } = req.body || {};
  if (!userId || !provider) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  try {
    getProviderConfig(provider);
  } catch {
    return res.status(404).json({ error: 'unknown_provider' });
  }

  try {
    const { accessToken, expiresAt } = await getFreshAccessToken(userId, provider);
    res.json({ accessToken, expiresAt });
  } catch (err) {
    if (err instanceof ProviderExpiredError) {
      return res
        .status(409)
        .json({ error: 'provider_expired', provider });
    }
    logger.error({ err, provider, userId }, '[connections] internal token failed');
    res.status(500).json({ error: 'token_fetch_failed' });
  }
});

export default router;
