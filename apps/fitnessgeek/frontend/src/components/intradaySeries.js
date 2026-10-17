/**
 * Shared shaping for the two Garmin/InfluxDB intraday panels
 * (`IntradayDashboard`, `MealImpactVisualization`).
 *
 * Both used to be chart.js charts declaring `scales.x.type: 'time'` — which
 * never worked: neither module registered chart.js's `TimeScale`, so the
 * detailed charts threw "time is not a registered scale" the moment they
 * rendered. Q52a replaced them with @nivo/line, whose time scale needs the x
 * values to arrive as real `Date` objects. That is all this module does:
 * parse once, drop the rows that will not parse, and hand back a nivo series.
 */

import { shortDay, clockTime } from '../utils/dates.js';

/** A `Date` if the value parses, otherwise null. */
export const toDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * `[{ time, value }]` → `[{ id, color, data: [{ x: Date, y: number }] }]`,
 * sorted by time. Returns `[]` — not a series with an empty `data` array —
 * when there is nothing to draw, so callers can render their empty state with
 * one length check.
 *
 * @param {Array<{time: *, value: *}>} rows
 * @param {string} id      series id (also the tooltip's label)
 * @param {string} color   stroke colour
 */
export const toTimeSeries = (rows, id, color) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const data = rows
    .map((row) => {
      const x = toDate(row?.time);
      // `Number(null)` is 0 and `Number('')` is 0, so a missing reading has to
      // be rejected BEFORE the numeric coercion — otherwise a gap in the
      // sensor feed draws as a genuine zero.
      const raw = row?.value;
      if (raw == null || raw === '') return null;
      const y = Number(raw);
      if (!x || !Number.isFinite(y)) return null;
      return { x, y };
    })
    .filter(Boolean)
    .sort((a, b) => a.x - b.x);

  if (data.length === 0) return [];
  return [{ id, color, data }];
};

/**
 * The tooltip's time text: "2:05 PM" by default, "Sep 6, 2:05 PM" for the
 * detailed charts. No zero-padded hours (review U-5).
 */
export const formatClockTime = (value, { withDate = false } = {}) => {
  const date = toDate(value);
  if (!date) return '';
  return withDate ? `${shortDay(date)}, ${clockTime(date)}` : clockTime(date);
};


/**
 * The InfluxDB intraday payload → `{ metric: [{ time, value }] }`.
 *
 * `GET /api/influx/intraday/:from/:to` returns the raw InfluxQL rows, so each
 * series carries the MEASUREMENT'S OWN column name — `HeartRate`,
 * `stressLevel`, `BodyBatteryLevel`, `BreathingRate` — not a uniform `value`
 * (backend/src/services/influxService.js). `IntradayDashboard` always mapped
 * those names across; `MealImpactVisualization` read `.value` straight off the
 * raw rows, so its chart drew nothing and every meal's impact computed as
 * "minimal" from two NaN averages. One shared normaliser, so the two panels
 * cannot disagree about the payload again.
 *
 * `point.value` is still accepted as a fallback: it is what a caller that has
 * already normalised (or a fixture) hands over.
 */
const METRIC_FIELDS = {
  heartRate: 'HeartRate',
  stress: 'stressLevel',
  bodyBattery: 'BodyBatteryLevel',
  breathing: 'BreathingRate',
};

/**
 * Readings that are codes, not measurements.
 *
 * Garmin writes stress as -1 ("not enough data") and -2 ("during activity")
 * alongside real 0-100 levels — 31 of 480 readings on 2026-09-21. Passed
 * through, they drew as dips to -2 on the sparkline and could become the
 * card's headline number. A code is dropped here, once, for every panel that
 * reads intraday stress.
 */
const isSentinel = (metric, value) => metric === 'stress' && typeof value === 'number' && value < 0;

export const normalizeIntraday = (response) => {
  const out = {};
  for (const [metric, field] of Object.entries(METRIC_FIELDS)) {
    const rows = Array.isArray(response?.[metric]) ? response[metric] : [];
    out[metric] = rows
      .map((point) => ({
        time: point?.time,
        value: point?.[field] ?? point?.value,
      }))
      .filter((point) => !isSentinel(metric, point.value));
  }
  return out;
};

export const EMPTY_INTRADAY = Object.freeze({
  heartRate: [], stress: [], bodyBattery: [], breathing: [],
});

export default { toDate, toTimeSeries, formatClockTime, normalizeIntraday, EMPTY_INTRADAY };
