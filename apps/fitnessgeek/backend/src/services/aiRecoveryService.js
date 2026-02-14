const influxService = require('./influxService');
const sleepAnalysisService = require('./sleepAnalysisService');
const UserSettings = require('../models/UserSettings');
const logger = require('../config/logger');

/**
 * Format comprehensive health context for AI analysis
 * This generates a detailed prompt with all relevant health metrics
 */
async function generateRecoveryContext(userId, date) {
  try {
    const settings = await UserSettings.getOrCreate(userId);

    if (!settings.influxEnabled) {
      return {
        available: false,
        message: 'InfluxDB integration not enabled'
      };
    }

    // Get all relevant data
    const [sleepAnalysis, dailyData, intradayMetrics] = await Promise.allSettled([
      sleepAnalysisService.analyzeSleep(date, {
        weeklyHRV: settings.healthBaselines?.weeklyHRV,
        restingHR: settings.healthBaselines?.restingHR
      }),
      influxService.getComprehensiveDaily(date),
      influxService.getIntradayMetrics(date, date)
    ]);

    const sleep = sleepAnalysis.status === 'fulfilled' ? sleepAnalysis.value : null;
    const daily = dailyData.status === 'fulfilled' ? dailyData.value : null;
    const intraday = intradayMetrics.status === 'fulfilled' ? intradayMetrics.value : null;

    // Calculate current status
    const now = new Date();
    const currentHR = intraday?.heartRate?.length > 0
      ? intraday.heartRate[intraday.heartRate.length - 1]?.HeartRate
      : null;
    const currentStress = intraday?.stress?.length > 0
      ? intraday.stress[intraday.stress.length - 1]?.stressLevel
      : null;
    const currentBattery = intraday?.bodyBattery?.length > 0
      ? intraday.bodyBattery[intraday.bodyBattery.length - 1]?.BodyBatteryLevel
      : null;

    // Format the context
    const context = {
      date,
      generated: now.toISOString(),

      // Sleep analysis
      sleep: sleep && sleep.available ? {
        quality: sleep.qualityLabel,
        score: sleep.qualityScore,
        duration: `${Math.floor(sleep.metrics.architecture.totalMinutes / 60)}h ${sleep.metrics.architecture.totalMinutes % 60}m`,
        deepSleepPercent: sleep.metrics.architecture.deepPercent,
        remSleepPercent: sleep.metrics.architecture.remPercent,
        sleepEfficiency: sleep.metrics.architecture.sleepEfficiency,
        awakenings: sleep.metrics.continuity.awakenings,
        hrvAvg: sleep.metrics.hrvRecovery.avgHRV,
        hrvDeviation: sleep.metrics.hrvRecovery.hrvDeviation,
        hrvStatus: sleep.metrics.hrvRecovery.hrvStatus,
        restingHR: sleep.metrics.cardiovascular.restingHeartRate,
        hrDip: sleep.metrics.cardiovascular.hrDipPercent,
        avgStress: sleep.metrics.stress.avgStress,
        bodyBatteryChange: sleep.metrics.stress.bodyBatteryChange,
        warnings: sleep.warnings,
        recommendations: sleep.recommendations
      } : null,

      // Current metrics
      current: {
        heartRate: currentHR,
        stress: currentStress,
        bodyBattery: currentBattery,
        time: now.toLocaleTimeString()
      },

      // Daily summary
      daily: daily ? {
        totalSteps: daily.totalSteps,
        restingHR: daily.hrv?.lastNightAvg || null,
        weeklyHRV: daily.hrv?.weeklyAvg || null
      } : null
    };

    return {
      available: true,
      context,
      promptText: formatPromptForAI(context)
    };

  } catch (err) {
    logger.error('Error generating recovery context', { userId, date, error: err.message });
    throw err;
  }
}

/**
 * Format context into AI prompt
 */
function formatPromptForAI(context) {
  const parts = [];

  parts.push('=== HEALTH & RECOVERY STATUS ===');
  parts.push(`Date: ${context.date}`);
  parts.push(`Time: ${context.current.time}`);
  parts.push('');

  // Current status
  parts.push('CURRENT STATUS:');
  if (context.current.heartRate) {
    parts.push(`• Heart Rate: ${context.current.heartRate} bpm`);
  }
  if (context.current.stress !== null) {
    parts.push(`• Stress Level: ${context.current.stress}/100`);
  }
  if (context.current.bodyBattery !== null) {
    parts.push(`• Body Battery: ${context.current.bodyBattery}/100`);
  }
  parts.push('');

  // Sleep analysis
  if (context.sleep) {
    parts.push('LAST NIGHT\'S SLEEP:');
    parts.push(`• Quality: ${context.sleep.quality} (${context.sleep.score}/100)`);
    parts.push(`• Duration: ${context.sleep.duration}`);
    parts.push(`• Deep Sleep: ${context.sleep.deepSleepPercent}% ${context.sleep.deepSleepPercent < 20 ? '⚠️ LOW' : '✓'}`);
    parts.push(`• REM Sleep: ${context.sleep.remSleepPercent}% ${context.sleep.remSleepPercent < 20 ? '⚠️ LOW' : '✓'}`);
    parts.push(`• Sleep Efficiency: ${context.sleep.sleepEfficiency}%`);
    parts.push(`• Awakenings: ${context.sleep.awakenings}`);
    parts.push('');

    parts.push('RECOVERY METRICS:');
    parts.push(`• HRV: ${context.sleep.hrvAvg}ms (baseline ${context.sleep.hrvDeviation >= 0 ? '+' : ''}${context.sleep.hrvDeviation}%) - ${context.sleep.hrvStatus}`);
    if (context.sleep.hrvDeviation < -10) {
      parts.push('  ⚠️ HRV significantly below baseline - incomplete recovery');
    }
    parts.push(`• Resting HR: ${context.sleep.restingHR} bpm`);
    parts.push(`• HR Dip During Sleep: ${context.sleep.hrDip}% ${context.sleep.hrDip < 15 ? '⚠️ LOW' : '✓'}`);
    if (context.sleep.hrDip < 15) {
      parts.push('  ⚠️ Insufficient HR recovery indicates incomplete parasympathetic activation');
    }
    parts.push(`• Avg Sleep Stress: ${context.sleep.avgStress}/100`);
    parts.push(`• Body Battery Recovery: ${context.sleep.bodyBatteryChange >= 0 ? '+' : ''}${context.sleep.bodyBatteryChange} points`);
    parts.push('');

    if (context.sleep.warnings.length > 0) {
      parts.push('CONCERNS:');
      context.sleep.warnings.forEach(warning => {
        parts.push(`• ${warning}`);
      });
      parts.push('');
    }
  }

  // Daily activity
  if (context.daily) {
    parts.push('TODAY\'S ACTIVITY:');
    if (context.daily.totalSteps) {
      parts.push(`• Total Steps: ${context.daily.totalSteps}`);
    }
    parts.push('');
  }

  // Recommendations
  if (context.sleep && context.sleep.recommendations.length > 0) {
    parts.push('SYSTEM RECOMMENDATIONS:');
    context.sleep.recommendations.forEach((rec, idx) => {
      parts.push(`${idx + 1}. [${rec.priority}] ${rec.issue}`);
      parts.push(`   → ${rec.suggestion}`);
    });
    parts.push('');
  }

  parts.push('=== END HEALTH DATA ===');
  parts.push('');
  parts.push('Based on the above metrics, provide:');
  parts.push('1. Overall recovery status and readiness for training');
  parts.push('2. Specific nutrition recommendations for today (macros, timing, foods to prioritize/avoid)');
  parts.push('3. Training intensity guidance (high/moderate/light/rest)');
  parts.push('4. One actionable tip to improve tonight\'s sleep');
  parts.push('5. Any patterns or concerns that need attention');

  return parts.join('\n');
}

/**
 * Get recovery recommendations (simplified format for dashboard display)
 */
async function getRecoveryRecommendations(userId, date) {
  try {
    const { available, context } = await generateRecoveryContext(userId, date);

    if (!available) {
      return { available: false, recommendations: [] };
    }

    const recommendations = [];

    // HRV-based recommendations
    if (context.sleep && context.sleep.hrvDeviation < -10) {
      recommendations.push({
        priority: 'HIGH',
        category: 'RECOVERY',
        title: 'Take a recovery day',
        message: 'HRV is significantly below baseline. Your nervous system needs rest.',
        action: 'Light activity only (walking, yoga). Prioritize sleep tonight.'
      });
    }

    // Deep sleep recommendations
    if (context.sleep && context.sleep.deepSleepPercent < 15) {
      recommendations.push({
        priority: 'HIGH',
        category: 'SLEEP',
        title: 'Improve deep sleep quality',
        message: 'Only ${context.sleep.deepSleepPercent}% deep sleep (target: 20-25%)',
        action: 'Try: dinner by 7pm, cool room (65-68°F), no alcohol, magnesium supplement'
      });
    }

    // Stress recommendations
    if (context.current.stress > 70) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'STRESS',
        title: 'Elevated stress detected',
        message: `Current stress: ${context.current.stress}/100`,
        action: 'Take 5-10 min break. Deep breathing, short walk, or meditation.'
      });
    }

    // Body battery recommendations
    if (context.current.bodyBattery < 30) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'ENERGY',
        title: 'Low energy reserves',
        message: `Body battery at ${context.current.bodyBattery}/100`,
        action: 'Eat protein-rich snack, hydrate, consider 20-min power nap if possible.'
      });
    }

    // HR dip recommendations
    if (context.sleep && context.sleep.hrDip < 10) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'CARDIOVASCULAR',
        title: 'Poor HR recovery during sleep',
        message: 'Heart rate didn\'t drop adequately',
        action: 'Check: late dinner? alcohol? dehydration? overtraining?'
      });
    }

    return {
      available: true,
      recommendations,
      readinessScore: calculateReadinessScore(context),
      context
    };

  } catch (err) {
    logger.error('Error getting recovery recommendations', { userId, date, error: err.message });
    throw err;
  }
}

/**
 * Calculate overall readiness score (0-100)
 */
function calculateReadinessScore(context) {
  let score = 50; // Start neutral

  if (!context.sleep) {
    return score;
  }

  // Sleep quality (30 points)
  score += (context.sleep.score - 50) * 0.6;

  // HRV status (20 points)
  if (context.sleep.hrvStatus === 'HIGH') score += 20;
  else if (context.sleep.hrvStatus === 'BALANCED') score += 10;
  else score -= 10;

  // HR dip (15 points)
  if (context.sleep.hrDip >= 15) score += 15;
  else if (context.sleep.hrDip >= 10) score += 5;
  else score -= 10;

  // Body battery (15 points)
  if (context.current.bodyBattery >= 70) score += 15;
  else if (context.current.bodyBattery >= 50) score += 8;
  else if (context.current.bodyBattery < 30) score -= 10;

  // Current stress (10 points)
  if (context.current.stress < 40) score += 10;
  else if (context.current.stress > 70) score -= 10;

  // Deep sleep (10 points)
  if (context.sleep.deepSleepPercent >= 20) score += 10;
  else if (context.sleep.deepSleepPercent < 15) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = {
  generateRecoveryContext,
  formatPromptForAI,
  getRecoveryRecommendations,
  calculateReadinessScore
};
