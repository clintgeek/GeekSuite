// The sleep HR dip is null by design (sleepAnalysisService.js), and null
// compared as a number is 0 — so every readiness score lost 10 points and a
// "Poor HR recovery" card fired every night (found 2026-09-23). Unknown must
// neither score nor warn.
const mod = (p) => new URL(p, import.meta.url).pathname;
import { describe, test, expect, jest } from '@jest/globals';

let hrDipPercent = null;
jest.unstable_mockModule(mod('../../services/influxService.js'), () => ({
  __esModule: true,
  default: {
    getComprehensiveDaily: async () => null,
    getIntradayMetrics: async () => ({ heartRate: [], stress: [], bodyBattery: [] }),
  },
}));
jest.unstable_mockModule(mod('../../services/sleepAnalysisService.js'), () => ({
  __esModule: true,
  default: {
    analyzeSleep: async () => ({
      available: true, qualityLabel: 'GOOD', qualityScore: 80, warnings: [], recommendations: [],
      metrics: {
        architecture: { asleepMinutes: 450, deepPercent: 18, remPercent: 20, sleepEfficiency: 90 },
        continuity: { awakenings: 2 },
        hrvRecovery: { avgHRV: 40, hrvDeviation: 0, hrvStatus: 'BALANCED' },
        cardiovascular: { restingHeartRate: 60, hrDipPercent },
        stress: { avgStress: 20, bodyBatteryChange: 40 },
      },
    }),
  },
}));
jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => ({
  __esModule: true,
  default: { getOrCreate: async () => ({ influxEnabled: true, healthBaselines: {} }) },
}));

const { calculateReadinessScore, formatPromptForAI, getRecoveryRecommendations } = await import('../../services/aiRecoveryService.js');

const context = (hrDip) => ({
  date: '2026-09-23',
  current: { time: '08:00', heartRate: 70, stress: 30, bodyBattery: 60 },
  sleep: {
    quality: 'GOOD', score: 80, duration: 7.5, deepSleepPercent: 18, remSleepPercent: 20, sleepEfficiency: 90,
    awakenings: 2, hrvAvg: 40, hrvDeviation: 0, hrvStatus: 'BALANCED', restingHR: 60, hrDip,
    avgStress: 20, bodyBatteryChange: 40, warnings: [], recommendations: [],
  },
  trends: {},
});

describe('readiness with an unknown HR dip', () => {
  test('null dip neither adds nor subtracts', () => {
    // 50 + (80-50)*0.6 + 10 (HRV) + 8 (battery) + 10 (stress) + 0 (deep 18%) = 96
    expect(calculateReadinessScore(context(null))).toBe(96);
  });
  test('a real dip still scores as before', () => {
    expect(calculateReadinessScore(context(16))).toBe(100);
    expect(calculateReadinessScore(context(12))).toBe(100); // 96 + 5, capped
    expect(calculateReadinessScore(context(5))).toBe(86);
  });
});

describe('the AI prompt with an unknown HR dip', () => {
  test('omits the HR dip line instead of printing "null% LOW"', () => {
    const text = formatPromptForAI(context(null));
    expect(text).not.toMatch(/HR Dip/);
    expect(text).not.toMatch(/null%/);
    expect(text).not.toMatch(/parasympathetic/);
  });
  test('prints it when known', () => {
    expect(formatPromptForAI(context(8))).toMatch(/HR Dip During Sleep: 8% ⚠️ LOW/);
  });
});

describe('recommendations with an unknown HR dip', () => {
  const titles = async () => (await getRecoveryRecommendations('u1', '2026-09-23')).recommendations.map((r) => r.title);

  test('no "Poor HR recovery" card when the dip is unknown', async () => {
    hrDipPercent = null;
    expect(await titles()).not.toContain('Poor HR recovery during sleep');
  });
  test('the card still fires on a real low dip', async () => {
    hrDipPercent = 6;
    expect(await titles()).toContain('Poor HR recovery during sleep');
  });
});

