/**
 * The shaping the two Garmin panels share after the Q52a port to @nivo/line.
 *
 * Nivo's time scale wants real Date objects on `x`; the old chart.js configs
 * handed it raw strings and never registered a TimeScale at all, which is why
 * both detailed charts threw. These cases pin the contract that replaced it.
 */
import { describe, it, expect } from 'vitest';
import {
  toDate,
  toTimeSeries,
  formatClockTime,
  normalizeIntraday,
  EMPTY_INTRADAY,
} from '../intradaySeries.js';

describe('toDate', () => {
  it('parses an ISO string', () => {
    expect(toDate('2026-09-06T08:30:00Z')).toBeInstanceOf(Date);
  });

  it('passes a valid Date straight through', () => {
    const d = new Date('2026-09-06T08:30:00Z');
    expect(toDate(d)).toBe(d);
  });

  it('returns null for junk, empty and nullish input', () => {
    for (const value of ['', null, undefined, 'not a date', new Date('nope')]) {
      expect(toDate(value)).toBeNull();
    }
  });
});

describe('toTimeSeries', () => {
  const rows = [
    { time: '2026-09-06T09:00:00Z', value: 70 },
    { time: '2026-09-06T08:00:00Z', value: 62 },
    { time: '2026-09-06T08:30:00Z', value: 65 },
  ];

  it('builds one nivo series with Date x values, sorted by time', () => {
    const series = toTimeSeries(rows, 'Heart Rate', '#f00');

    expect(series).toHaveLength(1);
    expect(series[0].id).toBe('Heart Rate');
    expect(series[0].color).toBe('#f00');
    expect(series[0].data.map((p) => p.y)).toEqual([62, 65, 70]);
    series[0].data.forEach((p) => expect(p.x).toBeInstanceOf(Date));
  });

  it('drops rows whose time or value will not parse', () => {
    const series = toTimeSeries(
      [
        ...rows,
        { time: 'garbage', value: 99 },
        { time: '2026-09-06T10:00:00Z', value: null },
        { time: '2026-09-06T11:00:00Z', value: 'abc' },
        null,
      ],
      'HR',
      '#f00'
    );
    expect(series[0].data).toHaveLength(3);
  });

  it('returns an EMPTY ARRAY, not an empty series, when there is nothing to draw', () => {
    // Callers render their empty state on `series.length === 0`; a series
    // whose `data` is [] would render an axis-only chart instead.
    expect(toTimeSeries([], 'HR', '#f00')).toEqual([]);
    expect(toTimeSeries(null, 'HR', '#f00')).toEqual([]);
    expect(toTimeSeries(undefined, 'HR', '#f00')).toEqual([]);
    expect(toTimeSeries([{ time: 'garbage', value: 1 }], 'HR', '#f00')).toEqual([]);
  });

  it('keeps a zero reading — 0 is a real body-battery value, not "missing"', () => {
    const series = toTimeSeries([{ time: '2026-09-06T08:00:00Z', value: 0 }], 'Energy', '#0f0');
    expect(series[0].data).toEqual([{ x: expect.any(Date), y: 0 }]);
  });
});

describe('formatClockTime', () => {
  const at = new Date(2026, 8, 6, 14, 5); // local time, so the assertion is stable

  it('is HH:MM by default', () => {
    expect(formatClockTime(at)).toBe(
      at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  });

  it('adds the calendar day when asked', () => {
    expect(formatClockTime(at, { withDate: true })).toContain('Sep');
  });

  it('is empty rather than "Invalid Date" for unparseable input', () => {
    expect(formatClockTime('garbage')).toBe('');
    expect(formatClockTime(null)).toBe('');
  });
});

describe('normalizeIntraday', () => {
  // The shape `GET /api/influx/intraday/:from/:to` actually returns: raw
  // InfluxQL rows, each keyed by its own measurement column.
  const payload = {
    heartRate: [{ time: '2026-09-06T08:00:00Z', HeartRate: 72 }],
    stress: [{ time: '2026-09-06T08:00:00Z', stressLevel: 31 }],
    bodyBattery: [{ time: '2026-09-06T08:00:00Z', BodyBatteryLevel: 88 }],
    breathing: [{ time: '2026-09-06T08:00:00Z', BreathingRate: 14 }],
  };

  it('renames every measurement column to `value`', () => {
    expect(normalizeIntraday(payload)).toEqual({
      heartRate: [{ time: '2026-09-06T08:00:00Z', value: 72 }],
      stress: [{ time: '2026-09-06T08:00:00Z', value: 31 }],
      bodyBattery: [{ time: '2026-09-06T08:00:00Z', value: 88 }],
      breathing: [{ time: '2026-09-06T08:00:00Z', value: 14 }],
    });
  });

  it('accepts an already-normalised row', () => {
    const out = normalizeIntraday({ heartRate: [{ time: 't', value: 60 }] });
    expect(out.heartRate).toEqual([{ time: 't', value: 60 }]);
  });

  it('always answers with all four metrics, even from junk', () => {
    for (const input of [undefined, null, {}, { heartRate: 'nope' }]) {
      expect(Object.keys(normalizeIntraday(input)).sort()).toEqual(
        ['bodyBattery', 'breathing', 'heartRate', 'stress']
      );
    }
  });

  it('feeds toTimeSeries directly — the whole point of normalising', () => {
    const series = toTimeSeries(normalizeIntraday(payload).heartRate, 'HR', '#f00');
    expect(series[0].data).toEqual([{ x: expect.any(Date), y: 72 }]);
  });

  it('EMPTY_INTRADAY is the same four keys, all empty', () => {
    expect(EMPTY_INTRADAY).toEqual({ heartRate: [], stress: [], bodyBattery: [], breathing: [] });
  });
});
