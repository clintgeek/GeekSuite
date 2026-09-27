/**
 * aiTraffic — the AI call ledger, summarised by day and by app.
 *
 * Read-only, admin-gated (see the resolver). It exists for the baseGeek
 * console's Signal Box dashboard, which draws two instruments nothing else
 * could feed honestly:
 *
 *   - the chart recorder: calls per UTC day for the last N days;
 *   - the traffic gauge: today's calls against the busiest day in that window.
 *
 * The source is `AISpend`, the dollar ledger, which books `calls` for free rows
 * as well as paid ones ("free is a number in the ledger rather than an absence
 * from it" — models/AISpend.js). It is not `aiService.getSessionStats()`: those
 * counters reset on every restart, so a chart drawn from them would drop to
 * zero after each deploy and call it a quiet day.
 *
 * Nothing here is a cap. A routing row's `dailyCap` counts per app, per
 * feature, per user (services/aiFeatureRunner.js), so an app-wide total drawn
 * against it would be a gauge that lies. The one app-wide ceiling is the
 * paid governor's dollars per day, and that already comes from `/api/ai/status`.
 */

export const DEFAULT_TRAFFIC_DAYS = 7;
export const MAX_TRAFFIC_DAYS = 31;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The ledger's own day key: UTC `YYYY-MM-DD`. Same rule as `spendDay`. */
function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

/** 1…31, defaulting to 7 for anything that is not a positive integer. */
export function clampTrafficDays(days) {
  const n = Math.floor(Number(days));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TRAFFIC_DAYS;
  return Math.min(n, MAX_TRAFFIC_DAYS);
}

/** The window's day keys, oldest first, ending on `now`'s UTC day. */
export function trafficWindow({ now = new Date(), days = DEFAULT_TRAFFIC_DAYS } = {}) {
  const count = clampTrafficDays(days);
  const end = new Date(now).getTime();
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) keys.push(dayKey(end - i * DAY_MS));
  return keys;
}

const int = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1e6) / 1e6 : 0;
};

/**
 * Fold ledger rows into the §aiTraffic shape.
 *
 * Every day in the window appears, zero-filled, so a quiet day is drawn as a
 * zero rather than silently closing the gap between its neighbours. Rows
 * outside the window are ignored rather than trusted to have been filtered.
 *
 * @param {Array<{day, app, calls, costUsd, refusals}>} rows
 * @param {{ now?: Date, days?: number }} [options]
 */
export function buildTraffic(rows, { now = new Date(), days = DEFAULT_TRAFFIC_DAYS } = {}) {
  const keys = trafficWindow({ now, days });
  const today = keys[keys.length - 1];
  const byDay = new Map(keys.map((key) => [key, { day: key, calls: 0, costUsd: 0, refusals: 0 }]));
  const byApp = new Map();

  for (const row of rows || []) {
    const bucket = byDay.get(row?.day);
    if (!bucket) continue;
    const calls = int(row.calls);
    const cost = Number(row.costUsd) || 0;
    bucket.calls += calls;
    bucket.costUsd += cost;
    bucket.refusals += int(row.refusals);

    if (row.day === today) {
      const app = String(row.app || 'unknown');
      const entry = byApp.get(app) || { app, calls: 0, costUsd: 0 };
      entry.calls += calls;
      entry.costUsd += cost;
      byApp.set(app, entry);
    }
  }

  return {
    today,
    days: [...byDay.values()].map((d) => ({ ...d, costUsd: money(d.costUsd) })),
    apps: [...byApp.values()]
      .map((a) => ({ ...a, costUsd: money(a.costUsd) }))
      .sort((a, b) => b.calls - a.calls || a.app.localeCompare(b.app)),
  };
}

/**
 * One indexed range read over `day` — the ledger's unique index leads with it —
 * then the fold above. `model` is injectable so the fold and the query can be
 * tested apart.
 */
export async function readTraffic(model, { now = new Date(), days = DEFAULT_TRAFFIC_DAYS } = {}) {
  const keys = trafficWindow({ now, days });
  const rows = await model
    .find({ day: { $gte: keys[0], $lte: keys[keys.length - 1] } })
    .select('day app calls costUsd refusals')
    .lean();
  return buildTraffic(rows, { now, days });
}
