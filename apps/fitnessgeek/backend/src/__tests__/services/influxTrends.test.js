/**
 * getDailyTrends — the daily Garmin trends behind GET /api/influx/trends
 * (DOCS/FITNESSGEEK_TRENDS_PLAN.md §3).
 *
 * The InfluxDB client is mocked; each query is answered from a fixture by the
 * measurement it names. Every number here is invented.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const queries = [];
let fixtures = {};
let failWith = null;

jest.unstable_mockModule('influx', () => ({
  InfluxDB: class {
    async query(q) {
      queries.push(q);
      if (failWith) throw failWith;
      if (/FROM "DailyStats"/.test(q)) return fixtures.daily || [];
      if (/FROM "SleepSummary"/.test(q)) return fixtures.sleep || [];
      if (/FROM "StressIntraday"/.test(q)) return fixtures.stress || [];
      if (/FROM "FitnessAge"/.test(q) && /LIMIT 1/.test(q)) return fixtures.fitLatest || [];
      if (/FROM "FitnessAge"/.test(q)) return fixtures.fit || [];
      return [];
    }
  },
}));

const influx = (await import('../../services/influxService.js')).default;

const W = 'Forerunner 965';
// A user in a UTC-5 zone: DailyStats lands at local midnight = 05:00Z.
const ds = (date, fields = {}, hour = '05') => ({
  time: new Date(`${date}T${hour}:00:00Z`), Device: W,
  restingHeartRate: 60, totalSteps: 8000, moderateIntensityMinutes: 20, vigorousIntensityMinutes: 5,
  activeKilocalories: 400, bodyBatteryHighestValue: 80, bodyBatteryLowestValue: 20, ...fields,
});

beforeEach(() => { queries.length = 0; fixtures = {}; failWith = null; });

describe('one point per calendar day', () => {
  test('every day in the window, oldest first, nulls where Garmin has nothing', async () => {
    fixtures.daily = [ds('2026-03-03')];
    const r = await influx.getDailyTrends('2026-03-05', 5);
    expect(r.available).toBe(true);
    expect(r.start).toBe('2026-03-01');
    expect(r.end).toBe('2026-03-05');
    expect(r.days.map((d) => d.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']);
    expect(r.days[0]).toEqual({
      date: '2026-03-01', restingHR: null, overnightHRV: null, sleepScore: null, sleepHours: null,
      steps: null, moderateMin: null, vigorousMin: null, activeKcal: null, stressMean: null,
      bodyBatteryHigh: null, bodyBatteryLow: null, fitnessAge: null,
    });
    expect(r.days[2].restingHR).toBe(60);
  });

  test('a window crossing a month end has no hole or repeat', async () => {
    fixtures.daily = [ds('2026-02-28')];
    const r = await influx.getDailyTrends('2026-03-02', 4);
    expect(r.days.map((d) => d.date)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });

  test('is a handful of queries over the window, not one per day', async () => {
    await influx.getDailyTrends('2026-09-20', 365);
    expect(queries).toHaveLength(5);
    for (const m of ['DailyStats', 'SleepSummary', 'StressIntraday']) {
      expect(queries.filter((q) => q.includes(`FROM "${m}"`))).toHaveLength(1);
    }
  });
});

describe('timestamp → calendar day', () => {
  test('DailyStats at local midnight maps to its own date, either side of DST', async () => {
    fixtures.daily = [
      ds('2026-03-07', { restingHeartRate: 61 }, '06'), // UTC-6 (standard time)
      ds('2026-03-08', { restingHeartRate: 62 }, '05'), // UTC-5 (daylight time)
    ];
    const r = await influx.getDailyTrends('2026-03-08', 2);
    expect(r.days.map((d) => d.restingHR)).toEqual([61, 62]);
  });

  test('a zone east of UTC: local midnight is the previous UTC evening, still its own date', async () => {
    fixtures.daily = [{ ...ds('2026-03-04'), time: new Date('2026-03-04T22:00:00Z') }]; // UTC+2 midnight of 03-05
    const r = await influx.getDailyTrends('2026-03-05', 2);
    expect(r.days.map((d) => d.restingHR)).toEqual([null, 60]);
  });

  test('a night belongs to the morning it ended on, in local time', async () => {
    fixtures.daily = [ds('2026-03-10'), ds('2026-03-11')];
    fixtures.sleep = [
      { time: new Date('2026-03-11T12:30:00Z'), Device: W, sleepTimeSeconds: 27000, sleepScore: 80, avgOvernightHrv: 40 },
      // 02:00Z is 21:00 local on 03-10 — a UTC-date mapping would call it 03-11.
      { time: new Date('2026-03-10T02:00:00Z'), Device: W, sleepTimeSeconds: 3600, sleepScore: 30, avgOvernightHrv: 30 },
    ];
    // Only the 03-11 morning can land on 03-11.
    let r = await influx.getDailyTrends('2026-03-11', 2);
    expect(r.days.map((d) => d.sleepScore)).toEqual([null, 80]);
    fixtures.sleep[1].time = new Date('2026-03-11T02:00:00Z');
    r = await influx.getDailyTrends('2026-03-11', 2);
    expect(r.days.map((d) => d.sleepScore)).toEqual([30, 80]);
  });

  test('stress is the mean of hourly buckets over the LOCAL day, weighted by samples', async () => {
    fixtures.daily = [ds('2026-03-10'), ds('2026-03-11')];
    fixtures.stress = [
      { time: new Date('2026-03-10T05:00:00Z'), mean: 20, n: 10 }, // local 00:00 on 03-10
      { time: new Date('2026-03-11T04:00:00Z'), mean: 50, n: 30 }, // local 23:00 on 03-10
      { time: new Date('2026-03-11T05:00:00Z'), mean: 33, n: 20 }, // local 00:00 on 03-11
    ];
    const r = await influx.getDailyTrends('2026-03-11', 2);
    // (20*10 + 50*30) / 40 = 42.5 → 43
    expect(r.days.map((d) => d.stressMean)).toEqual([43, 33]);
  });

  test('stress is a level from StressIntraday, not DailyStats stressPercentage, and skips negative codes', async () => {
    await influx.getDailyTrends('2026-03-11', 2);
    const q = queries.find((x) => x.includes('FROM "StressIntraday"'));
    expect(q).toMatch(/mean\("stressLevel"\)/);
    expect(q).toMatch(/"stressLevel" >= 0/);
    expect(queries.join('\n')).not.toMatch(/stressPercentage/);
  });
});

describe('values', () => {
  test('rounded: sleep hours and HRV to 0.1, counts to integers', async () => {
    fixtures.daily = [ds('2026-03-10', {
      restingHeartRate: 58.6, totalSteps: 9876.4, moderateIntensityMinutes: 12.5,
      vigorousIntensityMinutes: 3.2, activeKilocalories: 432.7,
    })];
    fixtures.sleep = [{ time: new Date('2026-03-10T12:00:00Z'), Device: W, sleepTimeSeconds: 26100, sleepScore: 77.4, avgOvernightHrv: 41.26 }];
    fixtures.fit = [{ time: new Date('2026-03-10T00:00:00Z'), Device: W, fitnessAge: 44.44 }];
    const [d] = (await influx.getDailyTrends('2026-03-10', 1)).days;
    expect(d).toMatchObject({
      restingHR: 59, steps: 9876, moderateMin: 13, vigorousMin: 3, activeKcal: 433,
      sleepHours: 7.3, sleepScore: 77, overnightHRV: 41.3, fitnessAge: 44.4,
    });
  });

  test('a zero resting HR, HRV or sleep is no reading, not a zero', async () => {
    fixtures.daily = [ds('2026-03-10', { restingHeartRate: 0, bodyBatteryHighestValue: 0 })];
    fixtures.sleep = [{ time: new Date('2026-03-10T12:00:00Z'), Device: W, sleepTimeSeconds: 0, sleepScore: 0, avgOvernightHrv: 0 }];
    const [d] = (await influx.getDailyTrends('2026-03-10', 1)).days;
    expect(d).toMatchObject({ restingHR: null, bodyBatteryHigh: null, sleepHours: null, sleepScore: null, overnightHRV: null });
  });

  test('zero intensity minutes on a worn day are a real zero', async () => {
    fixtures.daily = [ds('2026-03-10', { vigorousIntensityMinutes: 0 })];
    const [d] = (await influx.getDailyTrends('2026-03-10', 1)).days;
    expect(d.vigorousMin).toBe(0);
  });

  test('no steps and no active burn is an unworn watch: activity is unknown', async () => {
    fixtures.daily = [ds('2026-03-10', { totalSteps: 0, activeKilocalories: 0, moderateIntensityMinutes: 0, vigorousIntensityMinutes: 0 })];
    const [d] = (await influx.getDailyTrends('2026-03-10', 1)).days;
    expect(d).toMatchObject({ steps: null, activeKcal: null, moderateMin: null, vigorousMin: null, restingHR: 60 });
  });

  test('a duplicate day: the watch beats the stray Default copy, and a later re-sync wins', async () => {
    fixtures.daily = [
      { ...ds('2026-03-10', { restingHeartRate: 70 }), Device: 'Default' },
      ds('2026-03-10', { restingHeartRate: 55 }),
    ];
    fixtures.sleep = [
      { time: new Date('2026-03-10T11:00:00Z'), Device: W, sleepTimeSeconds: 18000, sleepScore: 60 },
      { time: new Date('2026-03-10T13:00:00Z'), Device: W, sleepTimeSeconds: 25200, sleepScore: 75 },
    ];
    const [d] = (await influx.getDailyTrends('2026-03-10', 1)).days;
    expect(d.restingHR).toBe(55);
    expect(d.sleepHours).toBe(7);
    expect(d.sleepScore).toBe(75);
  });
});

describe('fitnessAge (latest on or before end)', () => {
  test('asks for the latest point before the day after end', async () => {
    await influx.getDailyTrends('2026-03-10', 7);
    const q = queries.find((x) => x.includes('FROM "FitnessAge"') && /LIMIT 1/.test(x));
    expect(q).toContain("time < '2026-03-11T00:00:00Z'");
    expect(q).toMatch(/ORDER BY time DESC/);
  });

  test('picks the latest day across device series, 1 decimal', async () => {
    fixtures.daily = [ds('2026-03-10')];
    fixtures.fitLatest = [
      { time: new Date('2026-01-02T00:00:00Z'), Device: 'Default', fitnessAge: 50, chronologicalAge: 45, achievableFitnessAge: 40 },
      { time: new Date('2026-03-09T00:00:00Z'), Device: W, fitnessAge: 47.25, chronologicalAge: 45.0, achievableFitnessAge: 39.96 },
    ];
    const r = await influx.getDailyTrends('2026-03-10', 1);
    expect(r.fitnessAge).toEqual({ current: 47.3, chronological: 45, achievable: 40 });
  });

  test('null when there is none', async () => {
    fixtures.daily = [ds('2026-03-10')];
    expect((await influx.getDailyTrends('2026-03-10', 1)).fitnessAge).toBeNull();
  });
});

describe('activeKcal30', () => {
  test('mean of the 30 days ending at end that HAVE a value — even for a shorter window', async () => {
    fixtures.daily = [
      ds('2026-02-08', { activeKilocalories: 900 }), // day 31 back: outside
      ds('2026-02-09', { activeKilocalories: 300 }), // day 30 back: inside
      ds('2026-03-01', { activeKilocalories: 500 }),
      ds('2026-03-10', { activeKilocalories: 401 }),
      ds('2026-03-05', { totalSteps: 0, activeKilocalories: 0 }), // unworn: unknown, not zero
    ];
    const r = await influx.getDailyTrends('2026-03-10', 7);
    expect(r.days).toHaveLength(7);
    expect(r.activeKcal30).toEqual({ mean: 400, days: 3 });
    const q = queries.find((x) => x.includes('FROM "DailyStats"'));
    expect(q).toContain("time >= '2026-02-08T00:00:00Z'");
  });

  test('null when no day has one', async () => {
    fixtures.sleep = [{ time: new Date('2026-03-10T12:00:00Z'), Device: W, sleepTimeSeconds: 25000 }];
    const r = await influx.getDailyTrends('2026-03-10', 3);
    expect(r.available).toBe(true);
    expect(r.activeKcal30).toBeNull();
  });
});

describe('no data / Influx down', () => {
  test('nothing in the window → available: false, no days', async () => {
    fixtures.fitLatest = [{ time: new Date('2025-01-01T00:00:00Z'), Device: W, fitnessAge: 50, chronologicalAge: 45, achievableFitnessAge: 40 }];
    const r = await influx.getDailyTrends('2026-03-10', 30);
    expect(r).toEqual({ available: false, start: '2026-02-09', end: '2026-03-10', days: [], fitnessAge: null, activeKcal30: null });
  });

  test('a failing query surfaces as InfluxUnavailableError', async () => {
    failWith = new Error('connect ECONNREFUSED');
    await expect(influx.getDailyTrends('2026-03-10', 7)).rejects.toBeInstanceOf(influx.InfluxUnavailableError);
  });
});
