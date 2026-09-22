/**
 * Sleep analysis — decoded the way Garmin encodes it, and agreeing with the watch.
 *
 * Until 2026-09-22 this service read Garmin's stage codes with the wrong
 * mapping (AWAKE 0, LIGHT 1, DEEP 2, REM 3). Garmin's is DEEP 0, LIGHT 1,
 * REM 2, AWAKE 3. The dashboard therefore reported deep sleep as time awake
 * and REM as deep, and scored nights "POOR" (45-55) that the watch scored
 * 82-83. It had no tests.
 *
 * The night used below is the real one that proved it: 2026-09-22, where the
 * minutes per raw level were 71 / 325 / 131 / 39 and Garmin's own SleepSummary
 * read deep 71, light 325, REM 131, awake 39.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const mod = (p) => new URL(p, import.meta.url).pathname;

const getSleepIntraday = jest.fn();
const getSleepSummary = jest.fn();
const getHrvBaseline = jest.fn();

jest.unstable_mockModule(mod('../../services/influxService.js'), () => ({
  __esModule: true,
  default: { getSleepIntraday, getSleepSummary, getHrvBaseline },
}));

const svc = await import('../../services/sleepAnalysisService.js');
const {
  analyzeSleep,
  parseSleepData,
  analyzeSleepArchitecture,
  analyzeSleepContinuity,
  analyzeCardiovascularRecovery,
  analyzeRespiration,
  garminScoreLabel,
  SLEEP_STAGES,
} = svc;

// Garmin's encoding, spelled out so the fixtures read as what they are.
const DEEP = 0, LIGHT = 1, REM = 2, AWAKE = 3;
const T0 = Date.parse('2026-09-22T02:37:00Z');
const MIN = 60_000;

/**
 * Build Influx rows for a night from segments. A stage row is written at the
 * segment's START with its length in SleepStageSeconds — which is how Garmin's
 * data actually tiles (verified on live data: 25 of 25 gaps start-to-start).
 */
function night(segments, { hr = () => 60, spo2 = () => 95 } = {}) {
  const rows = [];
  let t = T0;
  for (const [level, minutes] of segments) {
    rows.push({ time: new Date(t).toISOString(), SleepStageLevel: level, SleepStageSeconds: minutes * 60 });
    t += minutes * MIN;
  }
  const end = t;
  for (let m = T0, i = 0; m < end; m += MIN, i++) {
    rows.push({ time: new Date(m).toISOString(), heartRate: hr(i, m), spo2Reading: spo2(i, m) });
  }
  return rows;
}

// The real night of 2026-09-22, reduced to its per-stage totals in a
// realistic order: light, deep early, REM later, a mid-night wake, and a
// final wake-up at the end.
const SEPT_22 = [
  [LIGHT, 13], [DEEP, 30], [LIGHT, 38], [DEEP, 41], [LIGHT, 60],
  [REM, 40], [AWAKE, 9], [LIGHT, 80], [REM, 50], [LIGHT, 70],
  [AWAKE, 10], [LIGHT, 64], [REM, 41], [AWAKE, 20],
];

describe('the stage codes are Garmin\'s', () => {
  test('0 is deep, 1 light, 2 REM, 3 awake', () => {
    expect(SLEEP_STAGES).toEqual({ DEEP: 0, LIGHT: 1, REM: 2, AWAKE: 3 });
  });

  test('reproduces the night that proved it, to the minute', () => {
    const { stages } = parseSleepData(night(SEPT_22));
    const a = analyzeSleepArchitecture(stages);
    // Garmin's SleepSummary for that night: deep 71, light 325, REM 131, awake 39.
    expect(a.deepMinutes).toBe(71);
    expect(a.lightMinutes).toBe(325);
    expect(a.remMinutes).toBe(131);
    expect(a.awakeMinutes).toBe(39);
  });

  test('total sleep is time asleep, not time in bed', () => {
    // Garmin's sleepTimeSeconds for that night was 527 minutes. The page used
    // to show totalMinutes — 566, time in bed — under the label "Total sleep".
    const a = analyzeSleepArchitecture(parseSleepData(night(SEPT_22)).stages);
    expect(a.asleepMinutes).toBe(527);
    expect(a.totalMinutes).toBe(566);
  });

  test('stage shares are of time asleep, as Garmin reports them', () => {
    const a = analyzeSleepArchitecture(parseSleepData(night(SEPT_22)).stages);
    expect(a.deepPercent).toBe(13);   // 71 / 527
    expect(a.remPercent).toBe(25);    // 131 / 527
  });

  test('efficiency counts deep sleep as sleep', () => {
    // Under the old mapping the 71 deep minutes were "awake" and this read 87%.
    const { stages } = parseSleepData(night(SEPT_22));
    expect(analyzeSleepArchitecture(stages).sleepEfficiency).toBe(93);
  });
});

describe('continuity', () => {
  test('the final wake-up is not an awakening', () => {
    // Two mid-night wakes plus waking up in the morning. Garmin counts 2.
    const { stages } = parseSleepData(night(SEPT_22));
    expect(analyzeSleepContinuity(stages).awakenings).toBe(2);
  });

  test('transitions per hour varies with the night, unlike the index it replaced', () => {
    // fragmentationIndex was transitions / segments * 100 — about 92 for any
    // night, because every Garmin row is a new segment.
    const busy = analyzeSleepContinuity(parseSleepData(night(SEPT_22)).stages);
    const calm = analyzeSleepContinuity(parseSleepData(night([[LIGHT, 60], [DEEP, 120], [REM, 120], [LIGHT, 180]])).stages);
    expect(busy.transitionsPerHour).not.toBe(calm.transitionsPerHour);
    expect(busy.transitionsPerHour).toBeLessThan(10);
    expect(busy.fragmentationIndex).toBeUndefined();
  });
});

describe('heart rate during deep sleep', () => {
  test('counts every sample inside a deep segment, not just its first two minutes', () => {
    // 50 bpm throughout deep sleep, 70 otherwise. The old matcher paired a
    // sample with "a stage row within two minutes", so a 41-minute deep
    // segment contributed two or three samples and the rest were lost.
    const segs = [[LIGHT, 20], [DEEP, 41], [LIGHT, 20]];
    const rows = night(segs, { hr: (i) => (i >= 20 && i < 61 ? 50 : 70) });
    const parsed = parseSleepData(rows);
    const cardio = analyzeCardiovascularRecovery(parsed.heartRates, parsed.stages);
    expect(cardio.avgDeepSleepHR).toBe(50);
  });

  test('the "dip" is not reported until it can be measured against daytime HR', () => {
    // It compared deep-sleep HR with the NIGHT's median — a stage against a
    // time of night — and warned "did not drop adequately" every night.
    const parsed = parseSleepData(night(SEPT_22));
    expect(analyzeCardiovascularRecovery(parsed.heartRates, parsed.stages).hrDipPercent).toBeNull();
  });
});

describe('SpO2 dips are episodes, not samples', () => {
  test('one five-minute stretch below 90% is one dip', () => {
    const parsed = parseSleepData(night([[LIGHT, 30]], { spo2: (i) => (i >= 10 && i < 15 ? 86 : 95) }));
    const r = analyzeRespiration(parsed.respirationValues, parsed.spo2Values);
    expect(r.spo2Dips).toBe(1);
    expect(r.spo2SamplesBelow90).toBe(5);
    expect(r.longestDipMinutes).toBe(5);
    expect(r.apneaIndicators).toBeUndefined();
  });

  test('two separate stretches are two dips', () => {
    const low = (i) => (i >= 5 && i < 8) || (i >= 20 && i < 22);
    const parsed = parseSleepData(night([[LIGHT, 30]], { spo2: (i) => (low(i) ? 85 : 95) }));
    expect(analyzeRespiration(parsed.respirationValues, parsed.spo2Values).spo2Dips).toBe(2);
  });
});

describe('Garmin\'s score bands', () => {
  test.each([[95, 'EXCELLENT'], [90, 'EXCELLENT'], [82, 'GOOD'], [80, 'GOOD'], [76, 'FAIR'], [60, 'FAIR'], [55, 'POOR'], [null, null]])(
    '%s is %s',
    (score, label) => expect(garminScoreLabel(score)).toBe(label)
  );
});

describe('analyzeSleep agrees with the watch', () => {
  beforeEach(() => {
    getSleepIntraday.mockResolvedValue(night(SEPT_22));
    getHrvBaseline.mockResolvedValue({ weeklyHRV: null, nights: 0 });
  });

  test('the headline score is Garmin\'s own', async () => {
    getSleepSummary.mockResolvedValue([{ sleepScore: 82, restingHeartRate: 64, awakeCount: 2 }]);
    const r = await analyzeSleep('2026-09-22');
    expect(r.qualityScore).toBe(82);
    expect(r.qualityLabel).toBe('GOOD');
    expect(r.scoreSource).toBe('garmin');
  });

  test('Garmin\'s reported values win over recomputed ones', async () => {
    getSleepSummary.mockResolvedValue([{
      sleepScore: 82, restingHeartRate: 64, avgOvernightHrv: 26,
      averageSpO2Value: 93.4, lowestSpO2Value: 83, awakeCount: 2,
    }]);
    const { metrics } = await analyzeSleep('2026-09-22');
    expect(metrics.cardiovascular.restingHeartRate).toBe(64);
    expect(metrics.hrvRecovery.avgHRV).toBe(26);   // Garmin's, not the intraday mean
    expect(metrics.respiration.avgSpO2).toBe(93);
    expect(metrics.respiration.minSpO2).toBe(83);
    expect(metrics.continuity.awakenings).toBe(2);
  });

  test('no Garmin score means no score — not a home-grown one', async () => {
    getSleepSummary.mockResolvedValue([]);
    const r = await analyzeSleep('2026-09-22');
    expect(r.available).toBe(true);
    expect(r.qualityScore).toBeNull();
    expect(r.qualityLabel).toBeNull();
    expect(r.scoreSource).toBeNull();
    // The rest of the page still has its data.
    expect(r.metrics.architecture.deepMinutes).toBe(71);
  });

  test('a summary that fails to load does not fail the analysis', async () => {
    getSleepSummary.mockRejectedValue(new Error('influx hiccup'));
    const r = await analyzeSleep('2026-09-22');
    expect(r.available).toBe(true);
    expect(r.qualityScore).toBeNull();
  });

  test('never warns about a heart-rate dip it did not measure', async () => {
    getSleepSummary.mockResolvedValue([{ sleepScore: 82 }]);
    const r = await analyzeSleep('2026-09-22');
    expect(r.warnings.join(' ')).not.toMatch(/heart rate recovery|drop adequately/i);
    expect(r.recommendations.find((x) => x.category === 'CARDIOVASCULAR')).toBeUndefined();
  });
});

/**
 * HRV against the person's own baseline.
 *
 * Every night used to read "hrvDeviation 0, BALANCED, recoveryScore 50",
 * because the baseline it compared against (UserSettings.healthBaselines)
 * was null in every live row and nothing computed it. The baseline now comes
 * from Garmin's own overnight HRV over the seven nights before.
 */
describe('HRV deviation', () => {
  beforeEach(() => {
    // Raw intraday HRV samples averaging 22 — deliberately NOT Garmin's 26.
    const rows = night(SEPT_22).map((r, i) => (r.heartRate ? { ...r, hrvData: i % 2 ? 20 : 24 } : r));
    getSleepIntraday.mockResolvedValue(rows);
    getSleepSummary.mockResolvedValue([{ sleepScore: 82, avgOvernightHrv: 26 }]);
  });

  test('is last night against the baseline, on the same measure', async () => {
    // 26 vs 24.9 is +4%. Using the intraday mean (22) would have read -12%
    // and "LOW" — a deviation manufactured by comparing two different things.
    getHrvBaseline.mockResolvedValue({ weeklyHRV: 24.9, nights: 7 });
    const { metrics } = await analyzeSleep('2026-09-22');
    expect(metrics.hrvRecovery).toEqual(expect.objectContaining({
      avgHRV: 26, baselineHRV: 24.9, baselineNights: 7, hrvDeviation: 4, hrvStatus: 'BALANCED',
    }));
  });

  test('beyond ten percent reads as high or low', async () => {
    getHrvBaseline.mockResolvedValue({ weeklyHRV: 22, nights: 7 });
    expect((await analyzeSleep('2026-09-22')).metrics.hrvRecovery.hrvStatus).toBe('HIGH');
    getHrvBaseline.mockResolvedValue({ weeklyHRV: 31, nights: 7 });
    expect((await analyzeSleep('2026-09-22')).metrics.hrvRecovery.hrvStatus).toBe('LOW');
  });

  test('no baseline is said plainly — not "BALANCED, 50"', async () => {
    getHrvBaseline.mockResolvedValue({ weeklyHRV: null, nights: 2 });
    const { metrics } = await analyzeSleep('2026-09-22');
    expect(metrics.hrvRecovery.hrvStatus).toBe('NO_BASELINE');
    expect(metrics.hrvRecovery.hrvDeviation).toBeNull();
    expect(metrics.hrvRecovery.baselineNights).toBe(2);
    expect(metrics.hrvRecovery.recoveryScore).toBeUndefined();
  });

  test('a baseline the person set themselves wins', async () => {
    getHrvBaseline.mockResolvedValue({ weeklyHRV: 24.9, nights: 7 });
    const { metrics } = await analyzeSleep('2026-09-22', { weeklyHRV: 20 });
    expect(metrics.hrvRecovery.baselineHRV).toBe(20);
    expect(metrics.hrvRecovery.hrvStatus).toBe('HIGH');
  });

  test('a baseline that fails to load does not fail the analysis', async () => {
    getHrvBaseline.mockRejectedValue(new Error('influx hiccup'));
    const r = await analyzeSleep('2026-09-22');
    expect(r.available).toBe(true);
    expect(r.metrics.hrvRecovery.hrvStatus).toBe('NO_BASELINE');
  });
});
