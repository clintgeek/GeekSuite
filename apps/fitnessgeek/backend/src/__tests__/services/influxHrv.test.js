/**
 * The two HRV queries.
 *
 * getHRVIntraday selected "lastNightAvg" and "weeklyAvg" from HRV_Intraday —
 * fields that measurement does not have (its only field is hrvValue). It
 * returned zero rows every time while ~114 real samples a night sat in the
 * same window, so the Recovery Coach's "weekly HRV" was always null.
 *
 * getHrvBaseline is new: the person's baseline from Garmin's own overnight
 * HRV, replacing a UserSettings field nothing ever filled.
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const queries = [];
let nextRows = [];

jest.unstable_mockModule('influx', () => ({
  InfluxDB: class {
    async query(q) { queries.push(q); return nextRows; }
  },
}));

const influx = (await import('../../services/influxService.js')).default;

beforeEach(() => { queries.length = 0; nextRows = []; });

describe('getHRVIntraday', () => {
  test('asks for the field that exists', async () => {
    await influx.getHRVIntraday('2026-09-22');
    expect(queries[0]).toMatch(/SELECT\s+"hrvValue"/);
    expect(queries[0]).not.toMatch(/lastNightAvg|weeklyAvg/);
  });
});

describe('getHrvBaseline', () => {
  test('averages the seven nights BEFORE the date, not including it', async () => {
    nextRows = [23, 27, 27, 23, 26, 25, 23].map((v) => ({ avgOvernightHrv: v }));
    const b = await influx.getHrvBaseline('2026-09-22');
    expect(queries[0]).toContain(">= '2026-09-15 00:00:00'");
    expect(queries[0]).toContain("< '2026-09-22 00:00:00'");
    expect(b).toEqual({ weeklyHRV: 24.9, nights: 7 });
  });

  test('fewer than three nights is no baseline, not a guess', async () => {
    nextRows = [{ avgOvernightHrv: 25 }, { avgOvernightHrv: 27 }];
    expect(await influx.getHrvBaseline('2026-09-22')).toEqual({ weeklyHRV: null, nights: 2 });
  });

  test('ignores nights with no reading', async () => {
    nextRows = [{ avgOvernightHrv: 24 }, { avgOvernightHrv: null }, { avgOvernightHrv: 0 }, { avgOvernightHrv: 26 }, { avgOvernightHrv: 25 }];
    expect(await influx.getHrvBaseline('2026-09-22')).toEqual({ weeklyHRV: 25, nights: 3 });
  });
});
