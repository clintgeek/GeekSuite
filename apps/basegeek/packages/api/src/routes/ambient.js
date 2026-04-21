/**
 * /api/ambient — dashgeek ambient-screen endpoints
 *
 * All routes are SSO-gated via authenticateToken. OAuth tokens are pulled
 * fresh from oauthConnectionService on every request; when that throws
 * ProviderExpiredError we respond 409 { error: 'provider_expired', provider }.
 *
 * Handlers are thin wrappers; shaping + upstream calls live in
 * services/ambientService.js.
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  fetchWeather,
  spotifyRequest,
  shapeNowPlaying,
  shapeQueue,
  calendarFetchEvents,
  gmailListMessages,
  gmailGetMessage,
  ProviderExpiredError,
} from '../services/ambientService.js';

const router = express.Router();

router.use(authenticateToken);

// ---------------------------------------------------------------------------
// Error helper — 409 on ProviderExpiredError, 500 otherwise
// ---------------------------------------------------------------------------

function handleProviderError(req, res, err, provider) {
  if (err instanceof ProviderExpiredError) {
    return res
      .status(409)
      .json({ error: 'provider_expired', provider });
  }
  req.log.error({ err }, `[ambient] ${provider} request failed`);
  return res.status(500).json({ error: 'upstream_failed' });
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

router.get('/weather', async (req, res) => {
  try {
    const payload = await fetchWeather();
    res.json(payload);
  } catch (err) {
    req.log.error({ err }, '[ambient] weather failed');
    res.status(500).json({ error: 'weather_failed' });
  }
});

// ---------------------------------------------------------------------------
// Spotify
// ---------------------------------------------------------------------------

router.get('/spotify/now-playing', async (req, res) => {
  try {
    const upstream = await spotifyRequest(
      req.user.id,
      'GET',
      '/currently-playing'
    );
    // Upstream returns 204 when nothing is playing — pass through.
    if (upstream.status === 204 || !upstream.data) {
      return res.status(204).send();
    }
    if (upstream.status < 200 || upstream.status >= 300) {
      req.log.warn(
        { status: upstream.status },
        '[ambient] spotify now-playing non-2xx'
      );
      return res.status(500).json({ error: 'upstream_failed' });
    }
    const shaped = shapeNowPlaying(upstream.data);
    if (!shaped) return res.status(204).send();
    res.json(shaped);
  } catch (err) {
    handleProviderError(req, res, err, 'spotify');
  }
});

router.get('/spotify/queue', async (req, res) => {
  try {
    const upstream = await spotifyRequest(req.user.id, 'GET', '/queue');
    if (upstream.status < 200 || upstream.status >= 300) {
      return res.status(500).json({ error: 'upstream_failed' });
    }
    res.json(shapeQueue(upstream.data));
  } catch (err) {
    handleProviderError(req, res, err, 'spotify');
  }
});

// Simple playback-control helper: fire the upstream call, 204 on success.
async function spotifyControl(req, res, method, path, params) {
  try {
    const upstream = await spotifyRequest(req.user.id, method, path, { params });
    if (upstream.status >= 200 && upstream.status < 300) {
      return res.status(204).send();
    }
    req.log.warn(
      { status: upstream.status, path },
      '[ambient] spotify control non-2xx'
    );
    res.status(500).json({ error: 'upstream_failed' });
  } catch (err) {
    handleProviderError(req, res, err, 'spotify');
  }
}

router.post('/spotify/play', (req, res) =>
  spotifyControl(req, res, 'PUT', '/play')
);
router.post('/spotify/pause', (req, res) =>
  spotifyControl(req, res, 'PUT', '/pause')
);
router.post('/spotify/next', (req, res) =>
  spotifyControl(req, res, 'POST', '/next')
);
router.post('/spotify/previous', (req, res) =>
  spotifyControl(req, res, 'POST', '/previous')
);

router.post('/spotify/volume', (req, res) => {
  const vol = Number(req.body?.volume_percent);
  if (!Number.isFinite(vol) || vol < 0 || vol > 100) {
    return res
      .status(400)
      .json({ error: 'volume_percent must be a number 0-100' });
  }
  return spotifyControl(req, res, 'PUT', '/volume', {
    volume_percent: Math.round(vol),
  });
});

router.post('/spotify/shuffle', (req, res) => {
  const state = req.body?.state;
  if (typeof state !== 'boolean') {
    return res.status(400).json({ error: 'state must be boolean' });
  }
  return spotifyControl(req, res, 'PUT', '/shuffle', { state });
});

// ---------------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------------

router.get('/calendar/events', async (req, res) => {
  try {
    const payload = await calendarFetchEvents(req.user.id);
    res.json(payload);
  } catch (err) {
    handleProviderError(req, res, err, 'google');
  }
});

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------

router.get('/gmail/messages', async (req, res) => {
  try {
    const payload = await gmailListMessages(req.user.id);
    res.json(payload);
  } catch (err) {
    handleProviderError(req, res, err, 'google');
  }
});

router.get('/gmail/messages/:id', async (req, res) => {
  try {
    const payload = await gmailGetMessage(req.user.id, req.params.id);
    res.json(payload);
  } catch (err) {
    handleProviderError(req, res, err, 'google');
  }
});

export default router;
