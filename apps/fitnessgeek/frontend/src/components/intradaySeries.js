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
 * The tooltip's time text. Matches what the chart.js `callbacks.title` used
 * to produce: HH:MM by default, "Mon D, HH:MM" for the detailed charts.
 */
export const formatClockTime = (value, { withDate = false } = {}) => {
  const date = toDate(value);
  if (!date) return '';
  return withDate
    ? date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

export const normalizeIntraday = (response) => {
  const out = {};
  for (const [metric, field] of Object.entries(METRIC_FIELDS)) {
    const rows = Array.isArray(response?.[metric]) ? response[metric] : [];
    out[metric] = rows.map((point) => ({
      time: point?.time,
      value: point?.[field] ?? point?.value,
    }));
  }
  return out;
};

export const EMPTY_INTRADAY = Object.freeze({
  heartRate: [], stress: [], bodyBattery: [], breathing: [],
});

export default { toDate, toTimeSeries, formatClockTime, normalizeIntraday, EMPTY_INTRADAY };
