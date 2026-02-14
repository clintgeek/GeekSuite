const { InfluxDB } = require('influx');
const logger = require('../config/logger');

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
    logger.debug('InfluxDB query', { query: queryString });
    const results = await influx.query(queryString);
    return results;
  } catch (err) {
    logger.error('InfluxDB query error', { query: queryString, error: err.message });
    throw new Error(`InfluxDB query failed: ${err.message}`);
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

  const queryStr = `
    SELECT "lastNightAvg", "weeklyAvg"
    FROM "HRV_Intraday"
    WHERE time >= ${startTime} AND time <= ${endTime}
    ORDER BY time ASC
  `;

  return await query(queryStr);
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
    hrvData,
    steps
  ] = await Promise.allSettled([
    getDailyStats(dateStr),
    getSleepSummary(dateStr),
    getHRVIntraday(dateStr),
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
    hrv: hrvData.status === 'fulfilled' ? hrvData.value[0] : null,
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
    logger.error('InfluxDB ping failed', { error: err.message });
    return { connected: false, error: err.message };
  }
}

module.exports = {
  query,
  getSleepIntraday,
  getSleepSummary,
  getHeartRateIntraday,
  getStressIntraday,
  getBodyBatteryIntraday,
  getStepsIntraday,
  getDailyStats,
  getHRVIntraday,
  getBreathingRateIntraday,
  getComprehensiveDaily,
  getIntradayMetrics,
  ping
};
