import { InfluxDB } from 'influx';
import logger from '../config/logger.js';

/**
 * Thrown when InfluxDB is unreachable, returns an auth error, or any
 * connection-level failure occurs.  Routes catch this type specifically
 * so they can return 200 + { available: false } instead of 500.
 */
class InfluxUnavailableError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'InfluxUnavailableError';
    this.code = 'INFLUX_UNAVAILABLE';
    this.originalError = originalError || null;
  }
}

const config = {
  protocol: process.env.INFLUXDB_PROTOCOL || 'http',
  host: process.env.INFLUXDB_HOST || 'localhost',
  port: Number(process.env.INFLUXDB_PORT || 8086),
  username: process.env.INFLUXDB_USERNAME,
  password: process.env.INFLUXDB_PASSWORD,
  database: process.env.INFLUXDB_DATABASE || 'geekdata',
};

// Create InfluxDB client
const influx = new InfluxDB({
  host: config.host,
  port: config.port,
  protocol: config.protocol,
  username: config.username,
  password: config.password,
  database: config.database,
  options: {
    rejectUnauthorized: false,
  },
});

/**
 * Query helper with error handling
 */
async function query(queryString) {
  try {
    logger.debug({ query: queryString }, 'InfluxDB query');
    const results = await influx.query(queryString);
    return results;
  } catch (err) {
    // Build a useful diagnostic string even when err.message is empty
    // (the influx Node client often omits .message on auth/connect failures).
    const diagnostic =
      err.message ||
      (err.statusCode ? `HTTP ${err.statusCode}` : null) ||
      (err.status ? `HTTP ${err.status}` : null) ||
      err.name ||
      'unknown influx error';

    logger.error({
      query: queryString,
      diagnostic,
      statusCode: err.statusCode || err.status || null,
      errName: err.name || null
    }, 'InfluxDB query error');

    throw new InfluxUnavailableError(`InfluxDB query failed: ${diagnostic}`, err);
  }
}

/**
 * Get sleep intraday data for a specific date (local time)
 * Returns minute-by-minute sleep metrics including stages, HR, HRV, SpO2, respiration
 */
async function getSleepIntraday(dateStr) {
  // Query for all sleep data on the given date
  // InfluxDB stores in UTC, so we need to query a wider range
  const startTime = `'${dateStr} 00:00:00'`;
  const endTime = `'${dateStr} 23:59:59'`;

  const queryStr = `
    SELECT
      "SleepStageLevel",
      "SleepStageSeconds",
      "SleepMovementActivityLevel",
      "SleepMovementActivitySeconds",
      "heartRate",
      "hrvData",
      "respirationValue",
      "spo2Reading",
      "stressValue",
      "bodyBattery",
      "sleepRestlessValue"
    FROM "SleepIntraday"
    WHERE time >= ${startTime} AND time <= ${endTime}
    ORDER BY time ASC
  `;

  return await query(queryStr);
}

/**
 * Get sleep summary for a specific date
 */
async function getSleepSummary(dateStr) {
  const startTime = `'${dateStr} 00:00:00'`;
  const endTime = `'${dateStr} 23:59:59'`;

  const queryStr = `
    SELECT *
    FROM "SleepSummary"
    WHERE time >= ${startTime} AND time <= ${endTime}
    ORDER BY time DESC
    LIMIT 1
  `;

  return await query(queryStr);
}

/**
 * Get heart rate intraday data for a date range
 */
async function getHeartRateIntraday(startDateStr, endDateStr) {
  const startTime = `'${startDateStr} 00:00:00'`;
  const endTime = `'${endDateStr} 23:59:59'`;

  const queryStr = `
    SELECT "HeartRate"
    FROM "HeartRateIntraday"
    WHERE time >= ${startTime} AND time <= ${endTime}
    ORDER BY time ASC
  `;

  return await query(queryStr);
}

/**
 * Get stress intraday data for a date range
 */
async function getStressIntraday(startDateStr, endDateStr) {
  const startTime = `'${startDateStr} 00:00:00'`;
  const endTime = `'${endDateStr} 23:59:59'`;

  const queryStr = `
    SELECT "stressLevel"
    FROM "StressIntraday"
    WHERE time >= ${startTime} AND time <= ${endTime}
    ORDER BY time ASC
  `;

  return await query(queryStr);
}

/**
 * Get body battery intraday data for a date range
 */
async function getBodyBatteryIntraday(startDateStr, endDateStr) {
  const startTime = `'${startDateStr} 00:00:00'`;
  const endTime = `'${endDateStr} 23:59:59'`;

  const queryStr = `
    SELECT "BodyBatteryLevel"
    FROM "BodyBatteryIntraday"
    WHERE time >= ${startTime} AND time <= ${endTime}
    ORDER BY time ASC
  `;

  return await query(queryStr);
}

/**
 * Get steps intraday data for a date
 */
async function getStepsIntraday(dateStr) {
  const startTime = `'${dateStr} 00:00:00'`;
  const endTime = `'${dateStr} 23:59:59'`;

  const queryStr = `
    SELECT "Steps"
    FROM "StepsIntraday"
    WHERE time >= ${startTime} AND time <= ${endTime}
    ORDER BY time ASC
  `;

  return await query(queryStr);
}

/**
 * Get daily stats for a date
 */
async function getDailyStats(dateStr) {
  const startTime = `'${dateStr} 00:00:00'`;
  const endTime = `'${dateStr} 23:59:59'`;

  const queryStr = `
    SELECT *
    FROM "DailyStats"
    WHERE time >= ${startTime} AND time <= ${endTime}
    ORDER BY time DESC
    LIMIT 1
  `;

  return await query(queryStr);
}

/**
 * Get HRV intraday data for a date
 */
async function getHRVIntraday(dateStr) {
  const startTime = `'${dateStr} 00:00:00'`;
  const endTime = `'${dateStr} 23:59:59'`;

  // `hrvValue` is the ONLY field this measurement has. This used to select
  // "lastNightAvg" and "weeklyAvg", which do not exist on it, so the query
  // returned zero rows every time while ~114 real samples a night sat in the
  // same window — and the Recovery Coach's "weekly HRV" was always null. The
  // nightly and weekly figures live in SleepSummary; see getHrvBaseline().
  const queryStr = `
    SELECT "hrvValue"
    FROM "HRV_Intraday"
    WHERE time >= ${startTime} AND time <= ${endTime}
    ORDER BY time ASC
  `;

  return await query(queryStr);
}

/** Nights needed before a baseline means anything. */
const HRV_BASELINE_MIN_NIGHTS = 3;

/**
 * The person's own HRV baseline: the mean of Garmin's overnight HRV
 * (`SleepSummary.avgOvernightHrv`) across the seven nights BEFORE `dateStr`.
 *
 * Before the night, not including it — a baseline that contains the night
 * being judged dilutes its own deviation. Fewer than three nights is too few
 * to call a baseline, so it is reported as absent rather than guessed.
 *
 * This replaces `UserSettings.healthBaselines.weeklyHRV`, which nothing ever
 * computed — it was null in every live row, so every night was reported as
 * "BALANCED, recovery 50". The data to compute it was in Influx all along.
 *
 * @returns {Promise<{ weeklyHRV: number|null, nights: number }>}
 */
async function getHrvBaseline(dateStr) {
  const day = new Date(`${dateStr}T00:00:00Z`);
  const from = new Date(day.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const rows = await query(`
    SELECT "avgOvernightHrv"
    FROM "SleepSummary"
    WHERE time >= '${from} 00:00:00' AND time < '${dateStr} 00:00:00'
  `);
  const values = rows
    .map((r) => r.avgOvernightHrv)
    .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  if (values.length < HRV_BASELINE_MIN_NIGHTS) return { weeklyHRV: null, nights: values.length };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { weeklyHRV: Math.round(mean * 10) / 10, nights: values.length };
}

/**
 * Get breathing rate intraday for a date
 */
async function getBreathingRateIntraday(dateStr) {
  const startTime = `'${dateStr} 00:00:00'`;
  const endTime = `'${dateStr} 23:59:59'`;

  const queryStr = `
    SELECT "BreathingRate"
    FROM "BreathingRateIntraday"
    WHERE time >= ${startTime} AND time <= ${endTime}
    ORDER BY time ASC
  `;

  return await query(queryStr);
}

/**
 * Get comprehensive daily data (combines multiple measurements)
 */
async function getComprehensiveDaily(dateStr) {
  const [
    dailyStats,
    sleepSummary,
    hrvBaseline,
    steps
  ] = await Promise.allSettled([
    getDailyStats(dateStr),
    getSleepSummary(dateStr),
    getHrvBaseline(dateStr),
    getStepsIntraday(dateStr)
  ]);

  // Calculate totals from intraday data
  let totalSteps = 0;
  if (steps.status === 'fulfilled' && steps.value.length > 0) {
    totalSteps = steps.value.reduce((sum, point) => sum + (point.Steps || 0), 0);
  }

  return {
    date: dateStr,
    dailyStats: dailyStats.status === 'fulfilled' ? dailyStats.value[0] : null,
    sleepSummary: sleepSummary.status === 'fulfilled' ? sleepSummary.value[0] : null,
    // Same shape the Recovery Coach already reads, now from fields that
    // exist: last night is Garmin's own overnight average, the week is the
    // seven nights before it.
    hrv: {
      lastNightAvg: sleepSummary.status === 'fulfilled' ? (sleepSummary.value[0]?.avgOvernightHrv ?? null) : null,
      weeklyAvg: hrvBaseline.status === 'fulfilled' ? hrvBaseline.value.weeklyHRV : null,
      baselineNights: hrvBaseline.status === 'fulfilled' ? hrvBaseline.value.nights : 0,
    },
    totalSteps,
    fetchedAt: new Date().toISOString()
  };
}

/**
 * Get intraday metrics for a specific time range (for charts/graphs)
 */
async function getIntradayMetrics(startDateStr, endDateStr) {
  const [
    heartRate,
    stress,
    bodyBattery,
    breathing
  ] = await Promise.allSettled([
    getHeartRateIntraday(startDateStr, endDateStr),
    getStressIntraday(startDateStr, endDateStr),
    getBodyBatteryIntraday(startDateStr, endDateStr),
    getBreathingRateIntraday(startDateStr)
  ]);

  return {
    heartRate: heartRate.status === 'fulfilled' ? heartRate.value : [],
    stress: stress.status === 'fulfilled' ? stress.value : [],
    bodyBattery: bodyBattery.status === 'fulfilled' ? bodyBattery.value : [],
    breathing: breathing.status === 'fulfilled' ? breathing.value : []
  };
}

/**
 * Test connectivity to InfluxDB
 */
async function ping() {
  try {
    await influx.ping(5000);
    return { connected: true };
  } catch (err) {
    logger.error({ error: err.message }, 'InfluxDB ping failed');
    return { connected: false, error: err.message };
  }
}

export { InfluxUnavailableError, query, getSleepIntraday, getSleepSummary, getHeartRateIntraday, getStressIntraday, getBodyBatteryIntraday, getStepsIntraday, getDailyStats, getHRVIntraday, getHrvBaseline, getBreathingRateIntraday, getComprehensiveDaily, getIntradayMetrics, ping };
export default { InfluxUnavailableError, query, getSleepIntraday, getSleepSummary, getHeartRateIntraday, getStressIntraday, getBodyBatteryIntraday, getStepsIntraday, getDailyStats, getHRVIntraday, getHrvBaseline, getBreathingRateIntraday, getComprehensiveDaily, getIntradayMetrics, ping };
