const influxService = require('./influxService');
const logger = require('../config/logger');

/**
 * Sleep stage constants
 */
const SLEEP_STAGES = {
  AWAKE: 0,
  LIGHT: 1,
  DEEP: 2,
  REM: 3
};

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

  return {
    totalMinutes,
    awakeMinutes: Math.round(awakeSeconds / 60),
    lightMinutes: Math.round(lightSeconds / 60),
    deepMinutes: Math.round(deepSeconds / 60),
    remMinutes: Math.round(remSeconds / 60),
    awakePercent: totalSeconds > 0 ? Math.round((awakeSeconds / totalSeconds) * 100) : 0,
    lightPercent: totalSeconds > 0 ? Math.round((lightSeconds / totalSeconds) * 100) : 0,
    deepPercent: totalSeconds > 0 ? Math.round((deepSeconds / totalSeconds) * 100) : 0,
    remPercent: totalSeconds > 0 ? Math.round((remSeconds / totalSeconds) * 100) : 0,
    sleepEfficiency: totalSeconds > 0 ? Math.round((sleepSeconds / totalSeconds) * 100) : 0
  };
}

/**
 * Calculate sleep continuity metrics
 */
function analyzeSleepContinuity(stages) {
  if (stages.length === 0) {
    return {
      fragmentationIndex: 0,
      wakeAfterSleepOnset: 0,
      awakenings: 0,
      stageTransitions: 0
    };
  }

  let transitions = 0;
  let awakenings = 0;
  let wakeAfterSleepOnset = 0;
  let sleepStarted = false;

  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1];
    const curr = stages[i];

    // Count stage transitions
    if (prev.stage !== curr.stage) {
      transitions++;
    }

    // Track awakenings after sleep onset
    if (prev.stage !== SLEEP_STAGES.AWAKE && curr.stage === SLEEP_STAGES.AWAKE) {
      if (sleepStarted) {
        awakenings++;
        wakeAfterSleepOnset += curr.durationSeconds || 60;
      }
    }

    // Mark sleep onset
    if (!sleepStarted && curr.stage !== SLEEP_STAGES.AWAKE) {
      sleepStarted = true;
    }
  }

  const fragmentationIndex = Math.round((transitions / stages.length) * 100);

  return {
    fragmentationIndex,
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

  // Calculate HR during deep sleep
  const deepSleepHRs = [];
  for (const hr of heartRates) {
    const stage = stages.find(s =>
      Math.abs(s.time.getTime() - hr.time.getTime()) < 120000 // within 2 minutes
    );
    if (stage && stage.stage === SLEEP_STAGES.DEEP) {
      deepSleepHRs.push(hr.value);
    }
  }

  const avgDeepSleepHR = deepSleepHRs.length > 0
    ? Math.round(deepSleepHRs.reduce((sum, hr) => sum + hr, 0) / deepSleepHRs.length)
    : 0;

  // Calculate HR dip (should be 15-25% during deep sleep)
  const baselineHR = Math.round(percentile(hrValues, 50)); // Median as baseline
  const hrDipPercent = avgDeepSleepHR > 0
    ? Math.round(((baselineHR - avgDeepSleepHR) / baselineHR) * 100)
    : 0;

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
      apneaIndicators: 0
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

  // Detect potential apnea events (SpO2 drops below 90%)
  const apneaIndicators = spo2s.filter(s => s < 90).length;

  return {
    avgRespirationRate,
    respirationVariability,
    avgSpO2,
    minSpO2,
    apneaIndicators
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

/**
 * Generate sleep quality score (0-100)
 */
function calculateSleepQualityScore(metrics) {
  let score = 0;
  let factors = 0;

  // Duration (20 points): 7-9 hours optimal
  const durationHours = metrics.architecture.totalMinutes / 60;
  if (durationHours >= 7 && durationHours <= 9) {
    score += 20;
  } else if (durationHours >= 6 && durationHours <= 10) {
    score += 15;
  } else {
    score += 5;
  }
  factors++;

  // Deep sleep (20 points): 20-25% optimal
  if (metrics.architecture.deepPercent >= 20 && metrics.architecture.deepPercent <= 25) {
    score += 20;
  } else if (metrics.architecture.deepPercent >= 15) {
    score += 10;
  }
  factors++;

  // Sleep efficiency (15 points): >90% good
  if (metrics.architecture.sleepEfficiency >= 90) {
    score += 15;
  } else if (metrics.architecture.sleepEfficiency >= 85) {
    score += 10;
  } else if (metrics.architecture.sleepEfficiency >= 80) {
    score += 5;
  }
  factors++;

  // HRV recovery (20 points)
  if (metrics.hrvRecovery.recoveryScore) {
    score += Math.round(metrics.hrvRecovery.recoveryScore * 0.2);
  }
  factors++;

  // HR dip (15 points): 15-25% optimal
  if (metrics.cardiovascular.hrDipPercent >= 15 && metrics.cardiovascular.hrDipPercent <= 25) {
    score += 15;
  } else if (metrics.cardiovascular.hrDipPercent >= 10) {
    score += 10;
  } else if (metrics.cardiovascular.hrDipPercent > 0) {
    score += 5;
  }
  factors++;

  // Fragmentation (10 points): Lower is better
  if (metrics.continuity.fragmentationIndex < 20) {
    score += 10;
  } else if (metrics.continuity.fragmentationIndex < 30) {
    score += 5;
  }
  factors++;

  return Math.min(100, Math.round(score));
}

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

  // Resting HR elevation
  if (metrics.cardiovascular.restingHeartRate > 0) {
    // We'd need baseline to compare, but for now check HR dip
    if (metrics.cardiovascular.hrDipPercent < 10) {
      warnings.push('Insufficient heart rate recovery during sleep');
      recommendations.push({
        priority: 'MEDIUM',
        category: 'CARDIOVASCULAR',
        issue: 'Heart rate did not drop adequately during deep sleep',
        suggestion: 'Check for: late-night eating, alcohol, dehydration, or overtraining',
        impact: 'Poor HR dip suggests incomplete parasympathetic recovery'
      });
    }
  }

  // Sleep duration
  const durationHours = metrics.architecture.totalMinutes / 60;
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
  if (metrics.respiration.apneaIndicators > 0) {
    warnings.push(`${metrics.respiration.apneaIndicators} potential apnea events`);
    recommendations.push({
      priority: 'HIGH',
      category: 'RESPIRATORY',
      issue: 'SpO2 drops detected during sleep',
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
    // Get raw sleep data
    const rawData = await influxService.getSleepIntraday(dateStr);

    if (!rawData || rawData.length === 0) {
      return {
        date: dateStr,
        available: false,
        message: 'No sleep data available for this date'
      };
    }

    // Parse the data
    const parsed = parseSleepData(rawData);

    // Calculate all metrics
    const architecture = analyzeSleepArchitecture(parsed.stages);
    const continuity = analyzeSleepContinuity(parsed.stages);
    const cardiovascular = analyzeCardiovascularRecovery(parsed.heartRates, parsed.stages);
    const hrvRecovery = analyzeHRVRecovery(parsed.hrvValues, userBaselines.weeklyHRV);
    const respiration = analyzeRespiration(parsed.respirationValues, parsed.spo2Values);
    const stress = analyzeStressRecovery(parsed.stressValues, parsed.bodyBatteryValues);

    const metrics = {
      architecture,
      continuity,
      cardiovascular,
      hrvRecovery,
      respiration,
      stress
    };

    const qualityScore = calculateSleepQualityScore(metrics);
    const { recommendations, warnings } = generateRecommendations(metrics);

    // Determine overall quality label
    let qualityLabel = 'POOR';
    if (qualityScore >= 80) qualityLabel = 'EXCELLENT';
    else if (qualityScore >= 70) qualityLabel = 'GOOD';
    else if (qualityScore >= 60) qualityLabel = 'FAIR';

    return {
      date: dateStr,
      available: true,
      qualityScore,
      qualityLabel,
      metrics,
      recommendations,
      warnings,
      rawData: {
        stageCount: parsed.stages.length,
        hrCount: parsed.heartRates.length,
        hrvCount: parsed.hrvValues.length
      }
    };

  } catch (err) {
    logger.error('Sleep analysis error', { date: dateStr, error: err.message });
    throw err;
  }
}

module.exports = {
  analyzeSleep,
  parseSleepData,
  analyzeSleepArchitecture,
  analyzeSleepContinuity,
  analyzeCardiovascularRecovery,
  analyzeHRVRecovery,
  analyzeRespiration,
  analyzeStressRecovery,
  calculateSleepQualityScore,
  generateRecommendations
};
