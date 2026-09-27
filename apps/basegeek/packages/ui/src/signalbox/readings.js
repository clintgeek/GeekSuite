/**
 * readings — every number and lamp on the Signal Box, computed from real data.
 *
 * The rule for this console's theatre is that nothing on it is decorative: a
 * lamp is a health check, a needle is a ledger figure against a real ceiling,
 * a lit annunciator tile is an item the server put on the attention list. This
 * file is where each of those is decided, as pure functions, so the decisions
 * can be tested without rendering a dial (see __tests__/signalbox/readings).
 *
 * Nothing here invents a ceiling. Where the data has no honest maximum, the
 * reading says so (`max: null`) and the gauge draws "no reading" rather than a
 * needle parked against a number somebody typed.
 */

/** Lamp states. Each has its own shape and word, never just a colour. */
export const LAMP = Object.freeze({
  OK: 'ok',
  WARN: 'warn',
  FAULT: 'fault',
  OFF: 'off',
  UNKNOWN: 'unknown',
});

/** A health check slower than this is still up, but it is a caution. */
export const SLOW_MS = 1000;

/** The word printed beside a health lamp. */
export const HEALTH_WORD = Object.freeze({
  ok: 'online',
  warn: 'slow',
  fault: 'offline',
  off: 'off',
  unknown: 'checking...',
});

/**
 * A health reading (`{ online, latency }` or undefined while in flight) as a
 * lamp. Undefined is "checking", not "offline": the first paint of the page
 * must not report a fault it has not measured.
 */
export function healthLamp(reading) {
  if (reading === undefined || reading === null) return LAMP.UNKNOWN;
  if (!reading.online) return LAMP.FAULT;
  if (Number.isFinite(reading.latency) && reading.latency > SLOW_MS) return LAMP.WARN;
  return LAMP.OK;
}

/** "42ms", "offline", "checking..." — the readout beside a health lamp. */
export function healthDetail(reading) {
  const state = healthLamp(reading);
  if (state === LAMP.UNKNOWN) return HEALTH_WORD.unknown;
  if (state === LAMP.FAULT) return HEALTH_WORD.fault;
  return Number.isFinite(reading.latency) ? `${reading.latency}ms` : HEALTH_WORD[state];
}

const DOWN_KINDS = new Set(['provider_dead', 'provider_listing_failed']);

/**
 * A provider as a lamp, from `status.catalog.byProvider` and the attention
 * list. A provider the server has flagged is a fault whatever its counts say;
 * otherwise live models are green, only-cooling models are amber, and a
 * provider with nothing in the catalog is simply off (most of the nine are
 * unconfigured, and that is not an alarm).
 */
export function providerLamp(id, byProvider = {}, attention = []) {
  if ((attention || []).some((item) => item?.provider === id && DOWN_KINDS.has(item.kind))) {
    return { state: LAMP.FAULT, word: 'down' };
  }
  const row = byProvider?.[id] || {};
  const alive = Number(row.alive) || 0;
  const cooling = Number(row.cooling) || 0;
  if (alive > 0) return { state: LAMP.OK, word: `${alive} alive` };
  if (cooling > 0) return { state: LAMP.WARN, word: `${cooling} cooling` };
  return { state: LAMP.OFF, word: 'idle' };
}

/** value / max, clamped to 0…1; `null` when there is no honest maximum. */
export function gaugeFraction(value, max) {
  const v = Number(value);
  const m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return null;
  return Math.min(Math.max(v / m, 0), 1);
}

/**
 * The zone a fraction falls in. `invert` is for gauges where high is good
 * (the catalog's share of live models) rather than high is bad (spend).
 */
export function gaugeZone(fraction, { warn = 0.6, fault = 0.9, invert = false } = {}) {
  if (fraction === null || fraction === undefined) return LAMP.OFF;
  const f = invert ? 1 - fraction : fraction;
  if (f >= fault) return LAMP.FAULT;
  if (f >= warn) return LAMP.WARN;
  return LAMP.OK;
}

/** Needle angle in degrees on a 180° dial: -90 is empty, +90 is full. */
export function needleAngle(fraction) {
  if (fraction === null || fraction === undefined) return -90;
  return -90 + 180 * Math.min(Math.max(fraction, 0), 1);
}

/**
 * Paid spend today against the governor's per-day cap — the one app-wide
 * money ceiling the server enforces (`AI_PAID_PER_DAY_USD`), both halves from
 * `GET /api/ai/status`'s `spend`.
 */
export function spendReading(spend) {
  if (!spend) return null;
  const value = Number(spend.todayUsd) || 0;
  const max = Number(spend.capPerDayUsd) || null;
  const fraction = gaugeFraction(value, max);
  return { value, max, fraction, zone: gaugeZone(fraction) };
}

/**
 * Today's AI calls against the busiest day in the ledger window (`aiTraffic`).
 * Not a cap — there is no app-wide call cap to draw against — so the dial is
 * labelled as what it is, "today against this week's peak", and it has no
 * alarm zones: a busy day is not a fault.
 */
export function trafficReading(traffic) {
  const days = traffic?.days;
  if (!Array.isArray(days) || days.length === 0) return null;
  const value = Number(days[days.length - 1]?.calls) || 0;
  const peak = Math.max(0, ...days.map((d) => Number(d?.calls) || 0));
  const fraction = gaugeFraction(value, peak);
  return {
    value,
    max: peak || null,
    fraction: peak ? fraction : 0,
    zone: LAMP.OK,
    peakDay: peak ? days.find((d) => (Number(d?.calls) || 0) === peak)?.day ?? null : null,
  };
}

/**
 * The catalog's last probe: free models that answered, out of every free
 * model it tried. High is good, so the zones are inverted — under half alive
 * is a caution, under a quarter is a fault.
 */
export function catalogReading(catalog) {
  const probe = catalog?.lastProbe;
  if (!probe) return null;
  const alive = Number(probe.alive) || 0;
  const dead = Number(probe.dead) || 0;
  const max = alive + dead;
  const fraction = gaugeFraction(alive, max);
  return { value: alive, max: max || null, fraction, zone: gaugeZone(fraction, { warn: 0.5, fault: 0.75, invert: true }) };
}

/**
 * The annunciator: one tile per kind of attention item the server can raise,
 * in a fixed order so a tile is always in the same place. Kinds the server
 * adds later still get a tile, after the known ones, labelled by their kind.
 */
export const ANNUNCIATOR_KINDS = Object.freeze([
  { kind: 'provider_dead', label: 'Provider down' },
  { kind: 'provider_listing_failed', label: 'Listing failed' },
  { kind: 'discovery_stale', label: 'Catalog stale' },
  { kind: 'paid_budget_hit', label: 'Budget hit' },
  { kind: 'dead_pin', label: 'Dead pin' },
  { kind: 'unrouted_app', label: 'Unrouted app' },
  { kind: 'key_expiring', label: 'Key expiring' },
  { kind: 'model_retired', label: 'Model retired' },
  { kind: 'repinned', label: 'Repinned' },
  { kind: 'plaintext_keys', label: 'Plaintext keys' },
]);

export function annunciate(attention = []) {
  const counts = new Map();
  for (const item of attention || []) {
    if (!item?.kind) continue;
    const entry = counts.get(item.kind) || { count: 0, severity: 'info' };
    entry.count += 1;
    if (item.severity === 'warn') entry.severity = 'warn';
    counts.set(item.kind, entry);
  }
  const known = ANNUNCIATOR_KINDS.map(({ kind, label }) => {
    const entry = counts.get(kind);
    return { kind, label, count: entry?.count || 0, severity: entry?.severity || null, lit: Boolean(entry) };
  });
  const extra = [...counts.keys()]
    .filter((kind) => !ANNUNCIATOR_KINDS.some((k) => k.kind === kind))
    .sort()
    .map((kind) => ({
      kind,
      label: kind.replace(/_/g, ' '),
      count: counts.get(kind).count,
      severity: counts.get(kind).severity,
      lit: true,
    }));
  return [...known, ...extra];
}

/**
 * The line status for the split-flap board. A fault is something measured
 * as down; a caution is something slow, or a warn-severity attention item.
 * Unknowns ("checking") are neither, and while anything is still unknown with
 * nothing yet wrong the board says it is reading rather than "all clear".
 */
export function lineStatus({ lamps = [], attention = [] } = {}) {
  const faults = lamps.filter((s) => s === LAMP.FAULT).length;
  const cautions = lamps.filter((s) => s === LAMP.WARN).length
    + (attention || []).filter((item) => item?.severity === 'warn').length;
  const checking = lamps.filter((s) => s === LAMP.UNKNOWN).length;

  let message;
  if (faults || cautions) {
    const parts = [];
    if (faults) parts.push(`${faults} ${faults === 1 ? 'fault' : 'faults'}`);
    if (cautions) parts.push(`${cautions} ${cautions === 1 ? 'caution' : 'cautions'}`);
    message = parts.join(' · ');
  } else if (checking) {
    message = 'reading';
  } else {
    message = 'all lines clear';
  }
  const state = faults ? LAMP.FAULT : cautions ? LAMP.WARN : checking ? LAMP.UNKNOWN : LAMP.OK;
  return { faults, cautions, checking, message, state };
}

/**
 * Lamp changes between two readings, for the train register. Only a change
 * from one *measured* state to another is an event; the first reading after
 * "checking" is the baseline, not news.
 */
export function lampTransitions(previous = {}, next = {}) {
  const events = [];
  for (const [key, state] of Object.entries(next)) {
    const before = previous[key];
    if (!before || before === LAMP.UNKNOWN || state === LAMP.UNKNOWN) continue;
    if (before !== state) events.push({ key, from: before, to: state });
  }
  return events;
}

/** "$0.0231" style money, with enough places to see a free-tier day move. */
export function formatDollars(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

/** Short weekday for a ledger day key, read in UTC because the ledger is. */
export function dayLabel(dayKey) {
  const date = new Date(`${dayKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return String(dayKey || '');
  return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}
