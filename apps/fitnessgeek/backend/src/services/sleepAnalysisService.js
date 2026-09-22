import influxService from './influxService.js';
import logger from '../config/logger.js';

/**
 * Garmin's sleep stage codes, as they arrive in `SleepIntraday.SleepStageLevel`.
 *
 * These were declared as `AWAKE: 0, LIGHT: 1, DEEP: 2, REM: 3` until
 * 2026-09-22, which is not Garmin's encoding — so the dashboard reported deep
 * sleep as time awake and REM as deep, scored nights "POOR" that the watch
 * scored in the 80s, and generated its advice from that.
 *
 * The proof, from live data for the night of 2026-09-22: minutes per raw level
 * were 71 / 325 / 131 / 39, and Garmin's own `SleepSummary` for that night
 * reads deep 71, light 325, REM 131, awake 39. Four of four, exact. If this is
 * ever in doubt again, that comparison is the test — the summary sits in the
 * same database.
 */
const SLEEP_STAGES = {
  DEEP: 0,
  LIGHT: 1,
  REM: 2,
  AWAKE: 3
};

/**
 * Garmin's published sleep-score bands, so the label beside the score says
 * what the watch says. (The previous bands were 80/70/60 and made up.)
 */
function garminScoreLabel(score) {
  if (score == null) return null;
  if (score >= 90) return 'EXCELLENT';
  if (score >= 80) return 'GOOD';
  if (score >= 60) return 'FAIR';
  return 'POOR';
}

/**
 * Calculate percentile from array
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Calculate standard deviation
 */
function stdDev(arr) {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((sum, val) => sum + val, 0) / arr.length;
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Parse sleep intraday data into structured format
 */
function parseSleepData(rawData) {
  const stages = [];
  const heartRates = [];
  const hrvValues = [];
  const spo2Values = [];
  const respirationValues = [];
  const stressValues = [];
  const bodyBatteryValues = [];
  const restlessMoments = [];
  const movements = [];

  for (const point of rawData) {
    const timestamp = new Date(point.time);

    if (point.SleepStageLevel !== null && point.SleepStageLevel !== undefined) {
      stages.push({
        time: timestamp,
        stage: point.SleepStageLevel,
        durationSeconds: point.SleepStageSeconds || 60
      });
    }

    if (point.heartRate) {
      heartRates.push({ time: timestamp, value: point.heartRate });
    }

    if (point.hrvData) {
      hrvValues.push({ time: timestamp, value: point.hrvData });
    }

    if (point.spo2Reading) {
      spo2Values.push({ time: timestamp, value: point.spo2Reading });
    }

    if (point.respirationValue) {
      respirationValues.push({ time: timestamp, value: point.respirationValue });
    }

    if (point.stressValue !== null && point.stressValue !== undefined) {
      stressValues.push({ time: timestamp, value: point.stressValue });
    }

    if (point.bodyBattery !== null && point.bodyBattery !== undefined) {
      bodyBatteryValues.push({ time: timestamp, value: point.bodyBattery });
    }

    if (point.sleepRestlessValue) {
      restlessMoments.push({ time: timestamp, value: point.sleepRestlessValue });
    }

    if (point.SleepMovementActivityLevel !== null) {
      movements.push({
        time: timestamp,
        level: point.SleepMovementActivityLevel,
        durationSeconds: point.SleepMovementActivitySeconds || 60
      });
    }
  }

  return {
    stages,
    heartRates,
    hrvValues,
    spo2Values,
    respirationValues,
    stressValues,
    bodyBatteryValues,
    restlessMoments,
    movements
  };
}

/**
 * Calculate sleep architecture metrics
 */
function analyzeSleepArchitecture(stages) {
  if (stages.length === 0) {
    return {
      totalMinutes: 0,
      asleepMinutes: 0,
      awakeMinutes: 0,
      lightMinutes: 0,
      deepMinutes: 0,
      remMinutes: 0,
      awakePercent: 0,
      lightPercent: 0,
      deepPercent: 0,
      remPercent: 0
    };
  }

  let awakeSeconds = 0;
  let lightSeconds = 0;
  let deepSeconds = 0;
  let remSeconds = 0;

  for (const stage of stages) {
    const duration = stage.durationSeconds || 60;
    switch (stage.stage) {
      case SLEEP_STAGES.AWAKE:
        awakeSeconds += duration;
        break;
      case SLEEP_STAGES.LIGHT:
        lightSeconds += duration;
        break;
      case SLEEP_STAGES.DEEP:
        deepSeconds += duration;
        break;
      case SLEEP_STAGES.REM:
        remSeconds += duration;
        break;
    }
  }

  const totalSeconds = awakeSeconds + lightSeconds + deepSeconds + remSeconds;
  const totalMinutes = Math.round(totalSeconds / 60);
  const sleepSeconds = lightSeconds + deepSeconds + remSeconds;
  const pctOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

  return {
    // Time in BED — asleep plus awake. Kept under its old name for callers,
    // but it is not "total sleep", which is what the page used to label it.
    totalMinutes,
    // Time ASLEEP. This is Garmin's `sleepTimeSeconds` and what "Total sleep"
    // means on the watch.
    asleepMinutes: Math.round(sleepSeconds / 60),
    awakeMinutes: Math.round(awakeSeconds / 60),
    lightMinutes: Math.round(lightSeconds / 60),
    deepMinutes: Math.round(deepSeconds / 60),
    remMinutes: Math.round(remSeconds / 60),
    // Stage shares are of time ASLEEP, which is how Garmin reports them and
    // what the usual targets (deep 13-23%, REM 20-25%) are expressed against.
    // Awake is the exception: it only means anything as a share of time in bed.
    awakePercent: pctOf(awakeSeconds, totalSeconds),
    lightPercent: pctOf(lightSeconds, sleepSeconds),
    deepPercent: pctOf(deepSeconds, sleepSeconds),
    remPercent: pctOf(remSeconds, sleepSeconds),
    sleepEfficiency: pctOf(sleepSeconds, totalSeconds)
  };
}

/**
 * Calculate sleep continuity metrics
 */
function analyzeSleepContinuity(stages) {
  if (stages.length === 0) {
    return {
      transitionsPerHour: 0,
      wakeAfterSleepOnset: 0,
      awakenings: 0,
      stageTransitions: 0
    };
  }

  let transitions = 0;
  let awakenings = 0;
  let wakeAfterSleepOnset = 0;
  let sleepStarted = false;
  let asleepSeconds = 0;

  // The final segment of a night is usually waking up. That is the end of
  // sleep, not an interruption of it, and counting it made this report one
  // more awakening than Garmin does.
  const last = stages.length - 1;

  for (let i = 0; i < stages.length; i++) {
    const curr = stages[i];
    if (curr.stage !== SLEEP_STAGES.AWAKE) asleepSeconds += curr.durationSeconds || 60;
    if (i === 0) {
      if (curr.stage !== SLEEP_STAGES.AWAKE) sleepStarted = true;
      continue;
    }
    const prev = stages[i - 1];

    if (prev.stage !== curr.stage) transitions++;

    if (prev.stage !== SLEEP_STAGES.AWAKE && curr.stage === SLEEP_STAGES.AWAKE && sleepStarted && i !== last) {
      awakenings++;
      wakeAfterSleepOnset += curr.durationSeconds || 60;
    }

    if (!sleepStarted && curr.stage !== SLEEP_STAGES.AWAKE) sleepStarted = true;
  }

  /*
   * This replaced `fragmentationIndex = transitions / segments * 100`, which
   * could not vary. Garmin writes one row per SEGMENT, so consecutive rows
   * almost always differ and the ratio is (n-1)/n — 92% on every night
   * measured. Transitions per hour asleep does vary. It carries no
   * "good/high" verdict, because there is no calibrated threshold for
   * Garmin's segment granularity and inventing one is how the last number
   * went wrong.
   */
  const asleepHours = asleepSeconds / 3600;
  const transitionsPerHour = asleepHours > 0 ? Math.round((transitions / asleepHours) * 10) / 10 : 0;

  return {
    transitionsPerHour,
    wakeAfterSleepOnset: Math.round(wakeAfterSleepOnset / 60),
    awakenings,
    stageTransitions: transitions
  };
}

/**
 * Analyze cardiovascular recovery
 */
function analyzeCardiovascularRecovery(heartRates, stages) {
  if (heartRates.length === 0) {
    return {
      avgHeartRate: 0,
      restingHeartRate: 0,
      hrDipPercent: 0,
      avgDeepSleepHR: 0,
      hrVariability: 0
    };
  }

  const hrValues = heartRates.map(hr => hr.value);
  const avgHeartRate = Math.round(hrValues.reduce((sum, hr) => sum + hr, 0) / hrValues.length);
  const restingHeartRate = Math.round(percentile(hrValues, 10)); // 10th percentile as resting

  // Heart rate during deep sleep.
  //
  // A stage row is a SEGMENT: its time is the segment's start and
  // `durationSeconds` its length (verified 2026-09-22 — 25 of 25 gaps tile
  // start-to-start). A sample belongs to the segment that contains it. This
  // used to pair each sample with "a stage row within two minutes", which
  // only ever caught the first two minutes of a segment and dropped the rest.
  const deepSleepHRs = [];
  for (const hr of heartRates) {
    const t = hr.time.getTime();
    const stage = stages.find(s => {
      const start = s.time.getTime();
      return t >= start && t < start + (s.durationSeconds || 60) * 1000;
    });
    if (stage && stage.stage === SLEEP_STAGES.DEEP) {
      deepSleepHRs.push(hr.value);
    }
  }

  const avgDeepSleepHR = deepSleepHRs.length > 0
    ? Math.round(deepSleepHRs.reduce((sum, hr) => sum + hr, 0) / deepSleepHRs.length)
    : 0;

  /*
   * hrDipPercent is null on purpose, and stays null until it can be computed
   * properly.
   *
   * It was (night median - deep-sleep HR) / night median. That compares a
   * STAGE against a TIME OF NIGHT: Garmin front-loads deep sleep into the
   * first cycles, when heart rate is still coming down from the day, so on
   * real data deep-sleep HR sits ABOVE the night's median (71 vs 67 on
   * 2026-09-22) and the "dip" came out at 0% or below. It then fired "heart
   * rate did not drop adequately — check for alcohol, late eating" every
   * night. A real nocturnal dip compares sleeping HR with DAYTIME HR, which
   * needs waking-hours samples from `HeartRateIntraday`; `DailyStats` has no
   * daytime average. See DOCS/FITNESSGEEK_HEALTH_DASHBOARD_FINDINGS.md.
   */
  const hrDipPercent = null;

  const hrVariability = Math.round(stdDev(hrValues));

  return {
    avgHeartRate,
    restingHeartRate,
    hrDipPercent,
    avgDeepSleepHR,
    hrVariability
  };
}

/**
 * Analyze HRV-based recovery
 */
function analyzeHRVRecovery(hrvValues, weeklyBaseline = null) {
  if (hrvValues.length === 0) {
    return {
      avgHRV: 0,
      hrvDeviation: 0,
      hrvStatus: 'UNKNOWN',
      recoveryScore: 0
    };
  }

  const hrv = hrvValues.map(h => h.value);
  const avgHRV = Math.round(hrv.reduce((sum, v) => sum + v, 0) / hrv.length);

  // Compare to baseline if available
  let hrvDeviation = 0;
  let hrvStatus = 'BALANCED';
  let recoveryScore = 50; // Neutral

  if (weeklyBaseline && weeklyBaseline > 0) {
    hrvDeviation = Math.round(((avgHRV - weeklyBaseline) / weeklyBaseline) * 100);

    if (hrvDeviation < -10) {
      hrvStatus = 'LOW';
      recoveryScore = 30;
    } else if (hrvDeviation > 10) {
      hrvStatus = 'HIGH';
      recoveryScore = 80;
    } else {
      hrvStatus = 'BALANCED';
      recoveryScore = 60;
    }
  }

  return {
    avgHRV,
    hrvDeviation,
    hrvStatus,
    recoveryScore
  };
}

/**
 * Analyze respiratory health
 */
function analyzeRespiration(respirationValues, spo2Values) {
  if (respirationValues.length === 0 && spo2Values.length === 0) {
    return {
      avgRespirationRate: 0,
      respirationVariability: 0,
      avgSpO2: 0,
      minSpO2: 0,
      spo2Dips: 0,
      spo2SamplesBelow90: 0,
      longestDipMinutes: 0
    };
  }

  const respRates = respirationValues.map(r => r.value);
  const avgRespirationRate = respRates.length > 0
    ? Math.round(respRates.reduce((sum, r) => sum + r, 0) / respRates.length)
    : 0;
  const respirationVariability = Math.round(stdDev(respRates) * 10) / 10;

  const spo2s = spo2Values.map(s => s.value);
  const avgSpO2 = spo2s.length > 0
    ? Math.round(spo2s.reduce((sum, s) => sum + s, 0) / spo2s.length)
    : 0;
  const minSpO2 = spo2s.length > 0 ? Math.min(...spo2s) : 0;

  /*
   * Dips below 90%, counted as EPISODES.
   *
   * This used to count SAMPLES — one a minute — and label each one a
   * "potential apnea event", so a single 27-minute stretch counted as 27
   * events and a typical night read "80 potential apnea events" in red. A dip
   * is a run of consecutive low readings; a gap of more than 90 seconds
   * between samples ends one. "Apnea event" is also a clinical term with a
   * definition (airflow stopping for 10s+) a wrist sensor cannot measure, so
   * the reading is described as what it is: oxygen saturation below 90%.
   */
  let spo2Dips = 0;
  let longestDipMinutes = 0;
  let run = 0;
  let prevTime = null;
  for (const s of spo2Values) {
    const t = s.time.getTime();
    const contiguous = prevTime !== null && t - prevTime <= 90000;
    if (s.value < 90) {
      run = contiguous && run > 0 ? run + 1 : 1;
      if (run === 1) spo2Dips++;
      longestDipMinutes = Math.max(longestDipMinutes, run);
    } else {
      run = 0;
    }
    prevTime = t;
  }
  const spo2SamplesBelow90 = spo2s.filter(v => v < 90).length;

  return {
    avgRespirationRate,
    respirationVariability,
    avgSpO2,
    minSpO2,
    spo2Dips,
    spo2SamplesBelow90,
    longestDipMinutes
  };
}

/**
 * Analyze stress and autonomic nervous system
 */
function analyzeStressRecovery(stressValues, bodyBatteryValues) {
  const stress = stressValues.map(s => s.value);
  const avgStress = stress.length > 0
    ? Math.round(stress.reduce((sum, s) => sum + s, 0) / stress.length)
    : 0;

  // Count stress spikes (>70)
  const stressSpikes = stress.filter(s => s > 70).length;

  // Body battery recovery
  const batteryLevels = bodyBatteryValues.map(b => b.value);
  const bodyBatteryStart = batteryLevels.length > 0 ? batteryLevels[0] : 0;
  const bodyBatteryEnd = batteryLevels.length > 0 ? batteryLevels[batteryLevels.length - 1] : 0;
  const bodyBatteryChange = bodyBatteryEnd - bodyBatteryStart;

  return {
    avgStress,
    stressSpikes,
    bodyBatteryStart,
    bodyBatteryEnd,
    bodyBatteryChange
  };
}

/*
 * calculateSleepQualityScore() was removed 2026-09-22. It scored six factors
 * and half of them could not work: fragmentation was a constant that never
 * earned its points, the HR dip compared a stage against a time of night, and
 * HRV recovery was a flat 50 because no baseline existed. Fed the wrong stage
 * mapping on top, it scored nights 45-55 "POOR" that Garmin scored 82-83.
 *
 * The quality score is now Garmin's own `SleepSummary.sleepScore` — computed
 * on the device from far richer data than reaches this database, and the
 * number the person sees on their wrist. When Garmin has not scored a night
 * there is no score, rather than a guess dressed as one.
 */

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(metrics) {
  const recommendations = [];
  const warnings = [];

  // Deep sleep issues
  if (metrics.architecture.deepPercent < 15) {
    warnings.push('Low deep sleep percentage');
    recommendations.push({
      priority: 'HIGH',
      category: 'SLEEP_QUALITY',
      issue: 'Insufficient deep sleep',
      suggestion: 'Consider: earlier dinner, cooler room temperature (65-68°F), avoid alcohol/caffeine after 2pm',
      impact: 'Deep sleep is critical for physical recovery and growth hormone release'
    });
  }

  // HRV concerns
  if (metrics.hrvRecovery.hrvDeviation < -10) {
    warnings.push('Low HRV indicates incomplete recovery');
    recommendations.push({
      priority: 'HIGH',
      category: 'RECOVERY',
      issue: 'HRV significantly below baseline',
      suggestion: 'Take a rest day or limit to light activity only. Prioritize protein and hydration.',
      impact: 'Low HRV indicates sympathetic nervous system dominance (stress/overtraining)'
    });
  }

  // (An "HR did not drop adequately" rule lived here and fired every night.
  // It read hrDipPercent, which compared a stage against a time of night and
  // is null until it can be measured against daytime HR. No rule until then.)

  // Sleep duration — time asleep, not time in bed.
  const durationHours = metrics.architecture.asleepMinutes / 60;
  if (durationHours < 7) {
    warnings.push('Insufficient sleep duration');
    recommendations.push({
      priority: 'HIGH',
      category: 'DURATION',
      issue: `Only ${durationHours.toFixed(1)} hours of sleep`,
      suggestion: 'Aim for 7-9 hours. Consider earlier bedtime or adjusting wake time if possible.',
      impact: 'Sleep debt accumulates and impairs recovery, performance, and metabolic health'
    });
  }

  // Fragmentation
  if (metrics.continuity.awakenings > 3) {
    warnings.push('Frequent awakenings during sleep');
    recommendations.push({
      priority: 'MEDIUM',
      category: 'SLEEP_QUALITY',
      issue: `${metrics.continuity.awakenings} awakenings detected`,
      suggestion: 'Check for: sleep apnea symptoms, room noise/light, bladder issues (reduce evening fluids)',
      impact: 'Fragmented sleep reduces sleep quality and impairs memory consolidation'
    });
  }

  // Respiratory concerns
  if (metrics.respiration.spo2Dips > 0) {
    const r = metrics.respiration;
    warnings.push(`${r.spo2Dips} SpO2 dip${r.spo2Dips === 1 ? '' : 's'} below 90% (lowest ${r.minSpO2}%)`);
    recommendations.push({
      priority: 'HIGH',
      category: 'RESPIRATORY',
      issue: `Blood oxygen fell below 90% ${r.spo2Dips} time${r.spo2Dips === 1 ? '' : 's'}, longest ${r.longestDipMinutes} min`,
      suggestion: 'Consider sleep apnea screening. Try sleeping on side instead of back.',
      impact: 'Sleep apnea severely impairs sleep quality and increases cardiovascular risk'
    });
  }

  // Stress during sleep
  if (metrics.stress.avgStress > 40) {
    warnings.push('Elevated stress during sleep');
    recommendations.push({
      priority: 'MEDIUM',
      category: 'STRESS',
      issue: 'Stress levels remained high during sleep',
      suggestion: 'Practice evening relaxation routine: meditation, light reading, avoid screens 1hr before bed',
      impact: 'High nighttime stress prevents proper recovery and deep sleep'
    });
  }

  return { recommendations, warnings };
}

/**
 * Main analysis function
 */
async function analyzeSleep(dateStr, userBaselines = {}) {
  try {
    // The intraday rows and Garmin's own summary of the same night. The
    // summary is optional: a night can sync its minute data before its
    // summary lands, and that must not cost the person the rest of the page.
    const [rawData, summaryRows] = await Promise.all([
      influxService.getSleepIntraday(dateStr),
      influxService.getSleepSummary(dateStr).catch(() => [])
    ]);

    if (!rawData || rawData.length === 0) {
      return {
        date: dateStr,
        available: false,
        message: 'No sleep data available for this date'
      };
    }

    const summary = summaryRows?.[0] || null;
    const parsed = parseSleepData(rawData);

    const architecture = analyzeSleepArchitecture(parsed.stages);
    const continuity = analyzeSleepContinuity(parsed.stages);
    const cardiovascular = analyzeCardiovascularRecovery(parsed.heartRates, parsed.stages);
    const hrvRecovery = analyzeHRVRecovery(parsed.hrvValues, userBaselines.weeklyHRV);
    const respiration = analyzeRespiration(parsed.respirationValues, parsed.spo2Values);
    const stress = analyzeStressRecovery(parsed.stressValues, parsed.bodyBatteryValues);

    /*
     * Where Garmin already computed a number, Garmin's number wins.
     *
     * The device works from far more than reaches this database, and these
     * are the figures the person sees on the watch. A dashboard that
     * disagrees with the wrist about the same night is not a second opinion,
     * it is a bug report. Each override is a field Garmin reports directly;
     * the stage minutes are left as computed because, with the stage codes
     * decoded correctly, they already match the summary to the minute.
     */
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    if (summary) {
      if (num(summary.restingHeartRate) != null) cardiovascular.restingHeartRate = summary.restingHeartRate;
      if (num(summary.avgOvernightHrv) != null) hrvRecovery.avgHRV = Math.round(summary.avgOvernightHrv);
      if (num(summary.averageRespirationValue) != null) respiration.avgRespirationRate = Math.round(summary.averageRespirationValue);
      if (num(summary.averageSpO2Value) != null) respiration.avgSpO2 = Math.round(summary.averageSpO2Value);
      if (num(summary.lowestSpO2Value) != null) respiration.minSpO2 = summary.lowestSpO2Value;
      if (num(summary.awakeCount) != null) continuity.awakenings = summary.awakeCount;
    }

    const metrics = {
      architecture,
      continuity,
      cardiovascular,
      hrvRecovery,
      respiration,
      stress
    };

    const qualityScore = num(summary?.sleepScore);
    const qualityLabel = garminScoreLabel(qualityScore);
    const { recommendations, warnings } = generateRecommendations(metrics);

    return {
      date: dateStr,
      available: true,
      qualityScore,
      qualityLabel,
      // Says where the headline number came from, so the page can say
      // "no score from the watch yet" instead of showing a blank as a zero.
      scoreSource: qualityScore != null ? 'garmin' : null,
      metrics,
      recommendations,
      warnings,
      rawData: {
        stageCount: parsed.stages.length,
        hrCount: parsed.heartRates.length,
        hrvCount: parsed.hrvValues.length,
        hasGarminSummary: Boolean(summary)
      }
    };

  } catch (err) {
    logger.error({ date: dateStr, error: err.message }, 'Sleep analysis error');
    throw err;
  }
}

export { analyzeSleep, parseSleepData, analyzeSleepArchitecture, analyzeSleepContinuity, analyzeCardiovascularRecovery, analyzeHRVRecovery, analyzeRespiration, analyzeStressRecovery, generateRecommendations, garminScoreLabel, SLEEP_STAGES };
export default { analyzeSleep, parseSleepData, analyzeSleepArchitecture, analyzeSleepContinuity, analyzeCardiovascularRecovery, analyzeHRVRecovery, analyzeRespiration, analyzeStressRecovery, generateRecommendations, garminScoreLabel, SLEEP_STAGES };
