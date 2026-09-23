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

// ─── Daily trends (DOCS/FITNESSGEEK_TRENDS_PLAN.md §3) ─────────────────────

const DAY_MS = 86400000;

/** 'YYYY-MM-DD' + n calendar days (UTC arithmetic on a date, so no DST drift). */
function addDays(dateStr, n) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** The UTC midnight nearest to `ms` — the calendar date of a point Garmin writes at "a date". */
function nearestUtcDate(ms) {
  return new Date(Math.round(ms / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

const toMs = (t) => (t instanceof Date ? t.getTime() : Date.parse(t));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** A reading that cannot physiologically be zero or negative: those mean "no reading". */
const positive = (v) => (num(v) !== null && v > 0 ? v : null);
const round = (v, dp = 0) => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

/**
 * Group points by calendar day, collapsing duplicates. Garmin occasionally
 * writes a day twice — a stray `Device=Default` copy next to the watch's own
 * series, or a sleep summary re-synced with a later wake time. The watch's
 * point wins over `Default`, then the later point wins; any field it lacks is
 * taken from the other copy.
 */
function byDay(rows, dateOf) {
  const groups = new Map();
  for (const r of rows || []) {
    if (!r || r.time == null) continue;
    const d = dateOf(toMs(r.time));
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(r);
  }
  const out = new Map();
  for (const [d, list] of groups) {
    list.sort((a, b) =>
      ((a.Device === 'Default') - (b.Device === 'Default')) || (toMs(b.time) - toMs(a.time)));
    const merged = {};
    for (const r of list) {
      for (const [k, v] of Object.entries(r)) if (merged[k] == null && v != null) merged[k] = v;
    }
    out.set(d, merged);
  }
  return out;
}

/**
 * One point per calendar day for the `days` ending at `endDate` (inclusive),
 * oldest first, every day present — a field is null where Garmin has no
 * reading, so the client charts gaps rather than inventing zeros. Raw daily
 * values only; smoothing is the client's (the smoothing rule).
 *
 * How each measurement maps to a calendar day:
 *   - DailyStats is written at local midnight of its day, expressed in UTC
 *     (05:00Z in a UTC-5 zone). Its date is the nearest UTC midnight — right
 *     for any zone within ±12h, and across DST.
 *   - FitnessAge is written at 00:00Z of its date: the same rule.
 *   - SleepSummary is written at the wake-up time, so a night belongs to the
 *     morning it ended on. That instant is shifted into local time using the
 *     zone offset the DailyStats midnights reveal (the latest DailyStats point
 *     at or before it; UTC if there is none).
 *   - Stress is averaged from StressIntraday (hourly buckets, the same offset
 *     rule). DailyStats has no mean stress level: its `stressPercentage` is
 *     the share of measured time spent in low/medium/high stress, not a level,
 *     so it is not used for `stressMean`. Negative samples are Garmin's
 *     "not measured" / "activity" codes and are excluded, as Garmin does.
 *
 * `fitnessAge` (top level) is the latest FitnessAge point on or before
 * `endDate`, even if older than the window. `activeKcal30` is the mean
 * Garmin active burn over the 30 days ending at `endDate`, over the days that
 * HAVE a value (an unworn day is unknown, not zero).
 *
 * Five queries, one per measurement over the whole window, in parallel.
 */
async function getDailyTrends(endDate, days) {
  const start = addDays(endDate, -(days - 1));
  const kcalStart = addDays(endDate, -29);
  const qStart = addDays(start < kcalStart ? start : kcalStart, -1);
  const qEnd = addDays(endDate, 2); // exclusive; room for a wake-up after UTC midnight
  const window = `time >= '${qStart}T00:00:00Z' AND time < '${qEnd}T00:00:00Z'`;
  const afterEnd = `'${addDays(endDate, 1)}T00:00:00Z'`;

  const [dailyRows, sleepRows, stressRows, fitRows, fitLatestRows] = await Promise.all([
    query(`
      SELECT "restingHeartRate", "totalSteps", "moderateIntensityMinutes", "vigorousIntensityMinutes",
             "activeKilocalories", "bodyBatteryHighestValue", "bodyBatteryLowestValue", "Device"
      FROM "DailyStats" WHERE ${window}`),
    query(`
      SELECT "avgOvernightHrv", "sleepScore", "sleepTimeSeconds", "Device"
      FROM "SleepSummary" WHERE ${window}`),
    query(`
      SELECT mean("stressLevel") AS "mean", count("stressLevel") AS "n"
      FROM "StressIntraday" WHERE "stressLevel" >= 0 AND ${window}
      GROUP BY time(1h) fill(none)`),
    query(`
      SELECT "fitnessAge", "Device"
      FROM "FitnessAge" WHERE ${window}`),
    query(`
      SELECT "fitnessAge", "chronologicalAge", "achievableFitnessAge", "Device"
      FROM "FitnessAge" WHERE time < ${afterEnd}
      ORDER BY time DESC LIMIT 1`),
  ]);

  const daily = byDay(dailyRows, nearestUtcDate);

  // Local-midnight instants from DailyStats → the zone offset at any instant.
  const midnights = [...(dailyRows || [])]
    .filter((r) => r && r.time != null)
    .map((r) => { const t = toMs(r.time); return { t, offset: t - Date.parse(`${nearestUtcDate(t)}T00:00:00Z`) }; })
    .sort((a, b) => a.t - b.t);
  const localDate = (ms) => {
    let offset = midnights.length ? midnights[0].offset : 0;
    for (const m of midnights) { if (m.t <= ms) offset = m.offset; else break; }
    return new Date(ms - offset).toISOString().slice(0, 10);
  };

  const sleep = byDay(sleepRows, localDate);
  const fit = byDay(fitRows, nearestUtcDate);

  const stress = new Map(); // date → { sum, n }
  for (const r of stressRows || []) {
    const mean = num(r?.mean);
    const n = num(r?.n);
    if (mean === null || !n || r.time == null) continue;
    const d = localDate(toMs(r.time));
    const acc = stress.get(d) || { sum: 0, n: 0 };
    acc.sum += mean * n; acc.n += n;
    stress.set(d, acc);
  }

  const dayPoint = (date) => {
    const ds = daily.get(date) || {};
    const ss = sleep.get(date) || {};
    const st = stress.get(date);
    // A day with no steps and no active burn is an unworn watch, not a rest day.
    const worn = positive(ds.totalSteps) !== null || positive(ds.activeKilocalories) !== null;
    const act = (v) => (worn ? round(num(v)) : null);
    const sleepSec = positive(ss.sleepTimeSeconds);
    return {
      date,
      restingHR: round(positive(ds.restingHeartRate)),
      overnightHRV: round(positive(ss.avgOvernightHrv), 1),
      sleepScore: round(positive(ss.sleepScore)),
      sleepHours: sleepSec === null ? null : round(sleepSec / 3600, 1),
      steps: act(ds.totalSteps),
      moderateMin: act(ds.moderateIntensityMinutes),
      vigorousMin: act(ds.vigorousIntensityMinutes),
      activeKcal: act(ds.activeKilocalories),
      stressMean: st ? round(st.sum / st.n) : null,
      bodyBatteryHigh: round(positive(ds.bodyBatteryHighestValue)),
      bodyBatteryLow: round(positive(ds.bodyBatteryLowestValue)),
      fitnessAge: round(positive(fit.get(date)?.fitnessAge), 1),
    };
  };

  const points = [];
  for (let d = start; d <= endDate; d = addDays(d, 1)) points.push(dayPoint(d));

  const hasReading = (p) => Object.entries(p).some(([k, v]) => k !== 'date' && v !== null);
  if (!points.some(hasReading)) {
    return { available: false, start, end: endDate, days: [], fitnessAge: null, activeKcal30: null };
  }

  const kcal = [];
  for (let d = kcalStart; d <= endDate; d = addDays(d, 1)) {
    const v = dayPoint(d).activeKcal;
    if (v !== null) kcal.push(v);
  }
  const activeKcal30 = kcal.length
    ? { mean: Math.round(kcal.reduce((a, b) => a + b, 0) / kcal.length), days: kcal.length }
    : null;

  // LIMIT 1 applies per series (per Device tag), so this can be one row per
  // device: take the latest calendar day, then de-duplicate within it.
  const latestByDay = byDay(fitLatestRows, nearestUtcDate);
  const latestDate = [...latestByDay.keys()].sort().at(-1);
  const latest = latestDate ? latestByDay.get(latestDate) : null;
  const fitnessAge = latest && positive(latest.fitnessAge) !== null
    ? {
        current: round(positive(latest.fitnessAge), 1),
        chronological: round(positive(latest.chronologicalAge), 1),
        achievable: round(positive(latest.achievableFitnessAge), 1),
      }
    : null;

  return { available: true, start, end: endDate, days: points, fitnessAge, activeKcal30 };
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

export { InfluxUnavailableError, query, getSleepIntraday, getSleepSummary, getHeartRateIntraday, getStressIntraday, getBodyBatteryIntraday, getStepsIntraday, getDailyStats, getHRVIntraday, getHrvBaseline, getBreathingRateIntraday, getComprehensiveDaily, getIntradayMetrics, getDailyTrends, ping };
export default { InfluxUnavailableError, query, getSleepIntraday, getSleepSummary, getHeartRateIntraday, getStressIntraday, getBodyBatteryIntraday, getStepsIntraday, getDailyStats, getHRVIntraday, getHrvBaseline, getBreathingRateIntraday, getComprehensiveDaily, getIntradayMetrics, getDailyTrends, ping };
