const { GarminConnect } = require('garmin-connect');
const UserSettings = require('../models/UserSettings');
const logger = require('../config/logger');

async function buildClient(userId) {
  const settings = await UserSettings.getOrCreate(userId);
  if (!settings.garmin || !settings.garmin.enabled) {
    throw new Error('Garmin integration disabled');
  }

  const client = new GarminConnect({
    username: settings.garmin.username,
    password: settings.garmin.password
  });

  // Try token reuse first
  if (settings.garmin.oauth1_token && settings.garmin.oauth2_token) {
    try {
      client.loadToken(settings.garmin.oauth1_token, settings.garmin.oauth2_token);
      return { client, settings };
    } catch (err) {
      logger.warn('Failed to load saved Garmin tokens, will relogin', { userId, err: err.message });
    }
  }

  // Login and persist tokens
  await client.login();
  await persistTokens(userId, client);
  return { client, settings };
}

async function persistTokens(userId, client) {
  const oauth1 = client.client.oauth1Token;
  const oauth2 = client.client.oauth2Token;
  // Preserve existing garmin fields; only set specific token fields
  await UserSettings.findOneAndUpdate(
    { user_id: userId },
    {
      $set: {
        'garmin.oauth1_token': oauth1,
        'garmin.oauth2_token': oauth2,
        'garmin.last_connected_at': new Date()
      }
    },
    { new: true, upsert: true }
  );
}

async function getStatus(userId) {
  const settings = await UserSettings.getOrCreate(userId);
  const g = settings.garmin || {};
  return {
    enabled: !!g.enabled,
    hasCredentials: !!(g.username && g.password),
    hasTokens: !!(g.oauth1_token && g.oauth2_token),
    lastConnectedAt: g.last_connected_at || null
  };
}

async function getHeartRate(userId, date) {
  const { client } = await buildClient(userId);
  const d = date ? new Date(date) : new Date();
  const hr = await client.getHeartRate(d);
  // Persist token refresh if needed
  await persistTokens(userId, client);
  return hr;
}

async function getDaily(userId, date) {
  const { client, settings } = await buildClient(userId);
  const d = date ? new Date(date) : new Date();

  const [hrRes, weightRes, stepsRes, sleepRes, activitiesRes] = await Promise.allSettled([
    client.getHeartRate(d),
    client.getDailyWeightInPounds(d),
    // Steps count (if supported by client)
    client.getSteps ? client.getSteps(d) : Promise.reject(new Error('getSteps not supported')),
    // Sleep duration (returns { hours, minutes })
    client.getSleepDuration ? client.getSleepDuration(d) : Promise.reject(new Error('getSleepDuration not supported')),
    // Activities to approximate active calories for the day
    client.getActivities ? client.getActivities(0, 50) : Promise.reject(new Error('getActivities not supported'))
  ]);

  const result = {
    date: d.toISOString().split('T')[0],
    steps: null,
    activeCalories: null,
    restingHR: null,
    heartRate: null,
    weightLbs: null,
    fetchedAt: new Date().toISOString(),
    lastSyncAt: settings?.garmin?.last_connected_at || null
  };

  if (hrRes.status === 'fulfilled') {
    result.heartRate = hrRes.value;
    // Try common field names
    const hr = hrRes.value || {};
    result.restingHR = hr.restingHeartRate || hr.resting_hr || hr.resting || null;
  }
  if (weightRes.status === 'fulfilled') {
    result.weightLbs = weightRes.value ?? null;
  }

  if (stepsRes.status === 'fulfilled') {
    // Accept either a number or object that contains steps
    const s = stepsRes.value;
    result.steps = typeof s === 'number' ? s : (s?.steps || s?.totalSteps || null);
  }

  if (sleepRes.status === 'fulfilled' && sleepRes.value) {
    const { hours, minutes } = sleepRes.value;
    const h = typeof hours === 'number' ? hours : parseInt(hours, 10) || 0;
    const m = typeof minutes === 'number' ? minutes : parseInt(minutes, 10) || 0;
    result.sleepMinutes = h * 60 + m;
  }

  if (activitiesRes.status === 'fulfilled' && Array.isArray(activitiesRes.value)) {
    // Sum calories for activities on the requested local date
    const ymd = d.toISOString().split('T')[0];
    const activeCal = activitiesRes.value
      .filter(a => {
        const start = a?.startTimeLocal || a?.startTimeGMT || a?.startTime;
        if (!start) return false;
        const dateStr = (typeof start === 'string' ? start : new Date(start).toISOString()).substring(0, 10);
        return dateStr === ymd;
      })
      .reduce((sum, a) => sum + (a?.calories || a?.activityCalories || 0), 0);
    result.activeCalories = Math.round(activeCal) || null;
  }

  await persistTokens(userId, client);
  return result;
}

async function updateWeightToGarmin(userId, date, weightLbs, timezone) {
  const { client } = await buildClient(userId);
  await client.updateWeight(date ? new Date(date) : new Date(), weightLbs, timezone || 'America/Los_Angeles');
  await persistTokens(userId, client);
  return { success: true };
}

async function getSleepData(userId, date) {
  const { client } = await buildClient(userId);
  const d = date ? new Date(date) : new Date();

  try {
    const sleepData = await client.getSleepData(d);
    await persistTokens(userId, client);

    // Comprehensive health metrics for pattern analysis
    const result = {
      date: d.toISOString().split('T')[0],

      // Sleep Duration & Stages
      totalSleepMinutes: null,
      deepSleepMinutes: null,
      lightSleepMinutes: null,
      remSleepMinutes: null,
      awakeSleepMinutes: null,
      sleepStartTime: null,
      sleepEndTime: null,

      // Sleep Quality
      sleepScore: null,
      sleepQuality: null,  // POOR, FAIR, GOOD, EXCELLENT
      sleepFeedback: null,
      sleepInsight: null,
      restlessMoments: null,
      awakeCount: null,

      // Heart Rate
      restingHeartRate: null,
      avgSleepHeartRate: null,

      // HRV (Heart Rate Variability) - key recovery indicator
      avgOvernightHrv: null,
      hrvStatus: null,  // LOW, BALANCED, HIGH

      // Blood Oxygen (SpO2)
      avgSpO2: null,
      minSpO2: null,
      maxSpO2: null,

      // Respiration
      avgRespiration: null,
      minRespiration: null,
      maxRespiration: null,
      breathingDisruptionSeverity: null,

      // Stress & Recovery
      avgSleepStress: null,
      bodyBatteryChange: null,

      // Sleep Need
      sleepNeedBaseline: null,
      sleepNeedActual: null,
      nextDaySleepNeed: null
    };

    if (sleepData) {
      const dto = sleepData.dailySleepDTO || sleepData;

      if (dto) {
        // Sleep durations (seconds -> minutes)
        result.totalSleepMinutes = dto.sleepTimeSeconds ? Math.round(dto.sleepTimeSeconds / 60) : null;
        result.deepSleepMinutes = dto.deepSleepSeconds ? Math.round(dto.deepSleepSeconds / 60) : null;
        result.lightSleepMinutes = dto.lightSleepSeconds ? Math.round(dto.lightSleepSeconds / 60) : null;
        result.remSleepMinutes = dto.remSleepSeconds ? Math.round(dto.remSleepSeconds / 60) : null;
        result.awakeSleepMinutes = dto.awakeSleepSeconds ? Math.round(dto.awakeSleepSeconds / 60) : null;

        // Sleep times
        if (dto.sleepStartTimestampLocal) {
          result.sleepStartTime = new Date(dto.sleepStartTimestampLocal).toISOString();
        }
        if (dto.sleepEndTimestampLocal) {
          result.sleepEndTime = new Date(dto.sleepEndTimestampLocal).toISOString();
        }

        // Sleep quality metrics
        result.sleepScore = dto.sleepScores?.overall?.value || null;
        result.sleepQuality = dto.sleepScores?.overall?.qualifierKey || null;
        result.sleepFeedback = dto.sleepScoreFeedback || null;
        result.sleepInsight = dto.sleepScorePersonalizedInsight || null;
        result.restlessMoments = dto.restlessMomentsCount ?? sleepData.restlessMomentsCount ?? null;
        result.awakeCount = dto.awakeCount || null;

        // Heart rate
        result.restingHeartRate = sleepData.restingHeartRate || dto.restingHeartRate || null;
        result.avgSleepHeartRate = dto.avgHeartRate || null;

        // SpO2
        result.avgSpO2 = dto.averageSpO2Value || null;
        result.minSpO2 = dto.lowestSpO2Value || null;
        result.maxSpO2 = dto.highestSpO2Value || null;

        // Respiration
        result.avgRespiration = dto.averageRespirationValue || null;
        result.minRespiration = dto.lowestRespirationValue || null;
        result.maxRespiration = dto.highestRespirationValue || null;
        result.breathingDisruptionSeverity = dto.breathingDisruptionSeverity || null;

        // Stress
        result.avgSleepStress = dto.avgSleepStress || null;
      }

      // Top-level sleep data fields
      result.avgOvernightHrv = sleepData.avgOvernightHrv || null;
      result.hrvStatus = sleepData.hrvStatus || null;
      result.bodyBatteryChange = sleepData.bodyBatteryChange || null;

      // Sleep need
      if (dto?.sleepNeed) {
        result.sleepNeedBaseline = dto.sleepNeed.baseline || null;
        result.sleepNeedActual = dto.sleepNeed.actual || null;
      }
      if (dto?.nextSleepNeed) {
        result.nextDaySleepNeed = dto.nextSleepNeed.actual || null;
      }
    }

    return result;
  } catch (err) {
    logger.error('Error getting sleep data', { userId, error: err.message });
    throw err;
  }
}

async function getActivities(userId, start = 0, limit = 20) {
  const { client } = await buildClient(userId);

  try {
    const activities = await client.getActivities(start, limit);
    await persistTokens(userId, client);

    // Transform activities to a consistent format
    const transformed = (activities || []).map(a => ({
      activityId: a.activityId,
      activityName: a.activityName,
      activityType: a.activityType?.typeKey || a.activityTypeName || 'unknown',
      startTimeLocal: a.startTimeLocal,
      startTimeGMT: a.startTimeGMT,
      duration: a.duration, // seconds
      distance: a.distance, // meters
      calories: a.calories || a.activeKilocalories,
      averageHR: a.averageHR,
      maxHR: a.maxHR,
      averageSpeed: a.averageSpeed, // m/s
      elevationGain: a.elevationGain,
      steps: a.steps,
    }));

    return transformed;
  } catch (err) {
    logger.error('Error getting activities', { userId, error: err.message });
    throw err;
  }
}

module.exports = {
  buildClient,
  persistTokens,
  getStatus,
  getHeartRate,
  getDaily,
  updateWeightToGarmin,
  getSleepData,
  getActivities
};


