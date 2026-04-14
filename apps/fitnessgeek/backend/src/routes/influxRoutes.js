const express = require('express');
const router = express.Router();
const influxService = require('../services/influxService');
const { InfluxUnavailableError } = influxService;
const sleepAnalysisService = require('../services/sleepAnalysisService');
const UserSettings = require('../models/UserSettings');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../config/logger');

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
    logger.error('Error checking influx status', { userId: req.user.id, error: err.message });
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
    logger.error('Influx status check error', { userId: req.user.id, error: err.message });
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
      logger.warn('Influx unavailable for daily data', { userId: req.user.id, date: req.params.date, message: err.message });
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error('Error fetching daily influx data', {
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    });
    res.status(500).json({ error: 'Failed to fetch daily data from InfluxDB' });
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

    const analysis = await sleepAnalysisService.analyzeSleep(date, baselines);
    res.json(analysis);
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn('Influx unavailable for sleep analysis', { userId: req.user.id, date: req.params.date, message: err.message });
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error('Error analyzing sleep data', {
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    });
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
      logger.warn('Influx unavailable for intraday metrics', { userId: req.user.id, startDate, endDate, message: err.message });
      return res.json(influxUnavailableResponse(err, { startDate, endDate }));
    }
    logger.error('Error fetching intraday metrics', {
      userId: req.user.id,
      startDate: req.params.startDate,
      endDate: req.params.endDate,
      error: err.message
    });
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
      logger.warn('Influx unavailable for heart rate data', { userId: req.user.id, date: req.params.date, message: err.message });
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error('Error fetching heart rate data', {
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    });
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
      logger.warn('Influx unavailable for stress data', { userId: req.user.id, date: req.params.date, message: err.message });
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error('Error fetching stress data', {
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    });
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
      logger.warn('Influx unavailable for body battery data', { userId: req.user.id, date: req.params.date, message: err.message });
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error('Error fetching body battery data', {
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    });
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

    const aiRecoveryService = require('../services/aiRecoveryService');
    const data = await aiRecoveryService.generateRecoveryContext(req.user.id, date);
    res.json(data);
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn('Influx unavailable for recovery context', { userId: req.user.id, date: req.params.date, message: err.message });
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error('Error generating recovery context', {
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    });
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

    const aiRecoveryService = require('../services/aiRecoveryService');
    const data = await aiRecoveryService.getRecoveryRecommendations(req.user.id, date);
    res.json(data);
  } catch (err) {
    if (err instanceof InfluxUnavailableError) {
      logger.warn('Influx unavailable for recovery recommendations', { userId: req.user.id, date: req.params.date, message: err.message });
      return res.json(influxUnavailableResponse(err, { date }));
    }
    logger.error('Error getting recovery recommendations', {
      userId: req.user.id,
      date: req.params.date,
      error: err.message
    });
    res.status(500).json({ error: 'Failed to get recovery recommendations' });
  }
});

module.exports = router;
