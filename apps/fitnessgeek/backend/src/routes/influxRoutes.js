import express from 'express';
const router = express.Router();
import influxService from '../services/influxService.js';
const { InfluxUnavailableError } = influxService;
import sleepAnalysisService from '../services/sleepAnalysisService.js';
import * as aiRecoveryService from '../services/aiRecoveryService.js';
import UserSettings from '../models/UserSettings.js';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../config/logger.js';

/**
 * Build a uniform "influx unavailable" 200 response body.
 * `extra` can carry route-specific keys (date, startDate, etc.)
 */
function influxUnavailableResponse(err, extra = {}) {
  return {
    ...extra,
    available: false,
    reason: 'influx_unavailable',
    message: err.message || 'InfluxDB is unavailable'
  };
}

/**
 * Check if user has InfluxDB enabled
 */
async function checkInfluxEnabled(req, res, next) {
  try {
    const settings = await UserSettings.getOrCreate(req.user.id);
    if (!settings.influxEnabled) {
      return res.status(403).json({ error: 'InfluxDB integration not enabled for this user' });
    }
    next();
  } catch (err) {
    logger.error({ userId: req.user.id, error: err.message }, 'Error checking influx status');
    res.status(500).json({ error: 'Failed to check InfluxDB status' });
  }
}

/**
 * GET /api/influx/status
 * Check InfluxDB connectivity
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const settings = await UserSettings.getOrCreate(req.user.id);
    const pingResult = await influxService.ping();

    res.json({
      userEnabled: !!settings.influxEnabled,
      serverConnected: pingResult.connected,
      error: pingResult.error || null
    });
  } catch (err) {
    logger.error({ userId: req.user.id, error: err.message }, 'Influx status check error');
    res.status(500).json({ error: 'Failed to check InfluxDB status' });
  }
});

/**
 * GET /api/influx/daily/:date
 * Get comprehensive daily metrics from InfluxDB
 */
router.get('/daily/:date', authenticateToken, checkInfluxEnabled, async (req, res) => {
  try {
    const { date } = req.params;

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const data = await influxService.getComprehensiveDaily(date);
    res.json(data);
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn({ userId: req.user.id, date: req.params.date, message: err.message }, 'Influx unavailable for daily data');
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error({
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    }, 'Error fetching daily influx data');
    res.status(500).json({ error: 'Failed to fetch daily data from InfluxDB' });
  }
});

/**
 * GET /api/influx/trends?days=90&end=YYYY-MM-DD
 * One point per calendar day for the `days` ending at `end`, oldest first —
 * DOCS/FITNESSGEEK_TRENDS_PLAN.md §3; the shape is documented on the client
 * (frontend/src/services/influxService.js getTrends) and on getDailyTrends.
 *
 * `days` defaults to 90 and is clamped to 1..365. `end` is the caller's local
 * day; the client always sends it. Without it the server falls back to its
 * own UTC date, which can be a day off from the user's.
 */
// Not gated by checkInfluxEnabled's 403: Reports calls this for EVERY user,
// and the shared auth interceptor (@geeksuite/auth) answers any 401/403 by
// refreshing the token and replaying — so each Reports visit by a user
// without Influx cost a token refresh just to learn "not enabled". A user
// without the integration gets an ordinary 200 saying so.
router.get('/trends', authenticateToken, async (req, res) => {
  try {
    const settings = await UserSettings.getOrCreate(req.user.id);
    if (!settings.influxEnabled) {
      return res.json({ available: false, reason: 'not_enabled', days: [], fitnessAge: null, activeKcal30: null });
    }
  } catch (err) {
    logger.error({ userId: req.user.id, error: err.message }, 'Error checking influx status');
    return res.status(500).json({ error: 'Failed to check InfluxDB status' });
  }
  const { days: rawDays, end: rawEnd } = req.query;
  let days = 90;
  if (rawDays !== undefined) {
    if (typeof rawDays !== 'string' || !/^\d+$/.test(rawDays)) {
      return res.status(400).json({ error: 'days must be a whole number' });
    }
    days = Math.min(365, Math.max(1, Number(rawDays)));
  }
  let end;
  if (rawEnd !== undefined) {
    const parsed = typeof rawEnd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawEnd)
      ? new Date(`${rawEnd}T00:00:00Z`) : null;
    // Round-trip check rejects 2026-02-30 (Date would roll it to March).
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== rawEnd) {
      return res.status(400).json({ error: 'Invalid end date. Use YYYY-MM-DD' });
    }
    end = rawEnd;
  } else {
    end = new Date().toISOString().slice(0, 10);
  }

  try {
    const data = await influxService.getDailyTrends(end, days);
    res.json(data);
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn({ userId: req.user.id, end, days, message: err.message }, 'Influx unavailable for trends');
      return res.json(influxUnavailableResponse(err, { end, days: [], fitnessAge: null, activeKcal30: null }));
    }
    logger.error({ userId: req.user.id, end, days, error: err.message }, 'Error fetching influx trends');
    res.status(500).json({ error: 'Failed to fetch trends from InfluxDB' });
  }
});

/**
 * GET /api/influx/sleep-analysis/:date
 * Get comprehensive sleep analysis with advanced metrics
 */
router.get('/sleep-analysis/:date', authenticateToken, checkInfluxEnabled, async (req, res) => {
  try {
    const { date } = req.params;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Get user baselines if available
    const settings = await UserSettings.getOrCreate(req.user.id);
    const baselines = {
      weeklyHRV: settings.healthBaselines?.weeklyHRV || null,
      restingHR: settings.healthBaselines?.restingHR || null
    };

    const analysis = await sleepAnalysisService.analyzeSleep(date, baselines, {
      sleepApneaAlert: settings.health_alerts?.sleep_apnea_screening !== false,
    });
    res.json(analysis);
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn({ userId: req.user.id, date: req.params.date, message: err.message }, 'Influx unavailable for sleep analysis');
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error({
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    }, 'Error analyzing sleep data');
    res.status(500).json({ error: 'Failed to analyze sleep data' });
  }
});

/**
 * GET /api/influx/intraday/:startDate/:endDate
 * Get intraday metrics for charting (HR, stress, body battery)
 */
router.get('/intraday/:startDate/:endDate', authenticateToken, checkInfluxEnabled, async (req, res) => {
  try {
    const { startDate, endDate } = req.params;

    // Validate dates
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const data = await influxService.getIntradayMetrics(startDate, endDate);
    res.json(data);
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn({ userId: req.user.id, startDate, endDate, message: err.message }, 'Influx unavailable for intraday metrics');
      return res.json(influxUnavailableResponse(err, { startDate, endDate }));
    }
    logger.error({
      userId: req.user.id,
      startDate: req.params.startDate,
      endDate: req.params.endDate,
      error: err.message
    }, 'Error fetching intraday metrics');
    res.status(500).json({ error: 'Failed to fetch intraday metrics' });
  }
});

/**
 * GET /api/influx/heart-rate/:date
 * Get heart rate intraday for a specific date
 */
router.get('/heart-rate/:date', authenticateToken, checkInfluxEnabled, async (req, res) => {
  try {
    const { date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const data = await influxService.getHeartRateIntraday(date, date);
    res.json({ date, heartRate: data });
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn({ userId: req.user.id, date: req.params.date, message: err.message }, 'Influx unavailable for heart rate data');
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error({
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    }, 'Error fetching heart rate data');
    res.status(500).json({ error: 'Failed to fetch heart rate data' });
  }
});

/**
 * GET /api/influx/stress/:date
 * Get stress intraday for a specific date
 */
router.get('/stress/:date', authenticateToken, checkInfluxEnabled, async (req, res) => {
  try {
    const { date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const data = await influxService.getStressIntraday(date, date);
    res.json({ date, stress: data });
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn({ userId: req.user.id, date: req.params.date, message: err.message }, 'Influx unavailable for stress data');
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error({
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    }, 'Error fetching stress data');
    res.status(500).json({ error: 'Failed to fetch stress data' });
  }
});

/**
 * GET /api/influx/body-battery/:date
 * Get body battery intraday for a specific date
 */
router.get('/body-battery/:date', authenticateToken, checkInfluxEnabled, async (req, res) => {
  try {
    const { date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const data = await influxService.getBodyBatteryIntraday(date, date);
    res.json({ date, bodyBattery: data });
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn({ userId: req.user.id, date: req.params.date, message: err.message }, 'Influx unavailable for body battery data');
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error({
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    }, 'Error fetching body battery data');
    res.status(500).json({ error: 'Failed to fetch body battery data' });
  }
});

/**
 * GET /api/influx/recovery-context/:date
 * Get comprehensive recovery context for AI analysis
 */
router.get('/recovery-context/:date', authenticateToken, checkInfluxEnabled, async (req, res) => {
  try {
    const { date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const data = await aiRecoveryService.generateRecoveryContext(req.user.id, date);
    res.json(data);
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn({ userId: req.user.id, date: req.params.date, message: err.message }, 'Influx unavailable for recovery context');
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error({
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    }, 'Error generating recovery context');
    res.status(500).json({ error: 'Failed to generate recovery context' });
  }
});

/**
 * GET /api/influx/recovery-recommendations/:date
 * Get actionable recovery recommendations
 */
router.get('/recovery-recommendations/:date', authenticateToken, checkInfluxEnabled, async (req, res) => {
  try {
    const { date } = req.params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const data = await aiRecoveryService.getRecoveryRecommendations(req.user.id, date);
    res.json(data);
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn({ userId: req.user.id, date: req.params.date, message: err.message }, 'Influx unavailable for recovery recommendations');
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error({
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    }, 'Error getting recovery recommendations');
    res.status(500).json({ error: 'Failed to get recovery recommendations' });
  }
});

export default router;
