// The "consider sleep apnea screening" card is a per-user setting
// (settings.health_alerts.sleep_apnea_screening, default ON). Wrist SpO2 is
// noisy; a user who has already dealt with it can turn the nightly card off.
import { describe, test, expect } from '@jest/globals';
import { generateRecommendations } from '../../services/sleepAnalysisService.js';

// Benign on every other axis, so only the SpO2 rule can fire.
const metrics = (spo2Dips) => ({
  architecture: { deepPercent: 20, asleepMinutes: 450 },
  continuity: { awakenings: 1 },
  hrvRecovery: { hrvDeviation: 0 },
  stress: { avgStress: 20 },
  respiration: { spo2Dips, minSpO2: 86, longestDipMinutes: 2 },
});
const respiratory = (out) => out.recommendations.filter((r) => r.category === 'RESPIRATORY');

describe('sleep apnea screening suggestion', () => {
  test('on by default: a dip produces the card and the warning', () => {
    const out = generateRecommendations(metrics(3));
    expect(respiratory(out)).toHaveLength(1);
    expect(out.warnings.some((w) => /SpO2/.test(w))).toBe(true);
  });

  test('off: neither the card nor the warning', () => {
    const out = generateRecommendations(metrics(3), { sleepApneaAlert: false });
    expect(respiratory(out)).toHaveLength(0);
    expect(out.warnings.some((w) => /SpO2/.test(w))).toBe(false);
  });

  test('no dips: nothing either way', () => {
    expect(respiratory(generateRecommendations(metrics(0)))).toHaveLength(0);
  });
});
