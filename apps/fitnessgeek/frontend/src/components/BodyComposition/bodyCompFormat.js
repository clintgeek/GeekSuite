/**
 * bodyCompFormat — words and chart series for the body-composition section.
 *
 * Nothing here computes a change. Every average and every delta arrives in
 * the server's `BodyCompSummary`, already smoothed by `@geeksuite/utils`'
 * `bodyCompCurrent` / `bodyCompChange` (FITNESSGEEK_BODY_DATA_PLAN §0); this
 * module only phrases them. The one computation is the chart's trailing mean,
 * and that is `rollingMean` from the same package, not a local copy.
 */
import { rollingMean, utcDateString } from '@geeksuite/utils';

const MINUS = '−';
const EN_DASH = '–';

// A fixed table rather than `toLocaleDateString('en-GB', { month: 'short' })`:
// newer ICU builds say "Sept", older ones "Sep", so the same page would read
// differently on a phone and in CI.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "4 Oct" — a calendar date (UTC midnight or YYYY-MM-DD), day-first, read in UTC. */
export function formatDay(value, { year = false } = {}) {
  const ymd = utcDateString(value);
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${year ? ` ${y}` : ''}`;
}

/** "22 Sep" for an INSTANT (e.g. `latest_scan_at`), in the viewer's own zone. */
export function formatInstantDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * A window's date span: "16–22 Sep", "28 Aug – 3 Sep", "29 Dec 2025 – 4 Jan 2026",
 * or one day ("22 Sep") when from and to are the same day.
 */
export function formatSpan(from, to) {
  const a = utcDateString(from);
  const b = utcDateString(to);
  if (!a && !b) return '';
  if (!a || !b || a === b) return formatDay(a || b);
  const [ay, am] = a.split('-');
  const [by, bm] = b.split('-');
  if (ay !== by) return `${formatDay(a, { year: true })} ${EN_DASH} ${formatDay(b, { year: true })}`;
  if (am !== bm) return `${formatDay(a)} ${EN_DASH} ${formatDay(b)}`;
  return `${Number(a.slice(8))}${EN_DASH}${formatDay(b)}`;
}

/** "−7.0 lb" / "+1.0 lb" / "0.0 lb", with a true minus sign. */
export function signedLb(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const v = Math.round(n * 10) / 10;
  if (v === 0) return '0.0 lb';
  return `${v < 0 ? MINUS : '+'}${Math.abs(v).toFixed(1)} lb`;
}

/** Below this, a change is "about level" — inside the noise of a 7-day mean. */
export const STEADY_LB = 0.5;

const lb = (n) => `${Math.abs(n).toFixed(1)} lb`;
const dir = (n) => (Math.abs(n) < STEADY_LB ? 0 : Math.sign(n));

/**
 * One plain-language sentence for a `BodyCompChange` that is available.
 *
 * Honest about every combination, not just the flattering one: losing lean
 * mass, gaining fat, and a flat scale that hides a recomposition all get
 * said as what they are. Returns null when there is nothing to read.
 */
export function describeChange(change) {
  if (!change?.available) return null;
  const w = change.weight_change_lb;
  const f = change.fat_change_lb;
  const l = change.lean_change_lb;
  if (typeof w !== 'number') return null;

  const haveParts = typeof f === 'number' && typeof l === 'number';
  const W = dir(w);

  if (!haveParts) {
    if (W === 0) return 'Your weight is about where it was.';
    return W < 0 ? `You've lost about ${lb(w)}.` : `You've gained about ${lb(w)}.`;
  }

  const F = dir(f);
  const L = dir(l);

  if (W === 0) {
    if (F === 0 && L === 0) return 'Your weight, fat and lean mass are all about where they were.';
    if (F < 0 && L > 0) return `Your weight is about the same, but about ${lb(f)} of fat has given way to ${lb(l)} of lean mass.`;
    if (F > 0 && L < 0) return `Your weight is about the same, but about ${lb(l)} of lean mass has given way to ${lb(f)} of fat.`;
    return `Your weight is about the same; fat is ${F === 0 ? 'about level' : F < 0 ? `down ${lb(f)}` : `up ${lb(f)}`} and lean mass ${L === 0 ? 'about level' : L < 0 ? `down ${lb(l)}` : `up ${lb(l)}`}.`;
  }

  const verb = W < 0 ? 'lost' : 'gained';
  // Both parts moved with the weight: say how it splits.
  if (F === W && L === W) {
    return `Of the ${lb(w)} you've ${verb}, about ${lb(f)} was fat and ${lb(l)} lean.`;
  }
  // Only fat moved with it.
  if (F === W && L === 0) {
    return `Of the ${lb(w)} you've ${verb}, about ${lb(f)} was fat; lean mass held steady.`;
  }
  if (F === W && L === -W) {
    return `You've ${verb} ${lb(w)}: about ${lb(f)} of fat ${W < 0 ? 'lost' : 'gained'}, while lean mass ${L > 0 ? 'rose' : 'fell'} ${lb(l)}.`;
  }
  // Only lean moved with it.
  if (L === W && F === 0) {
    return `Of the ${lb(w)} you've ${verb}, about ${lb(l)} was lean mass; fat held steady.`;
  }
  if (L === W && F === -W) {
    return `You've ${verb} ${lb(w)}: about ${lb(l)} of lean mass ${W < 0 ? 'lost' : 'gained'}, while fat ${F > 0 ? 'rose' : 'fell'} ${lb(f)}.`;
  }
  return `You've ${verb} about ${lb(w)}.`;
}

/**
 * The fat and lean trend series for the chart, from `getScans()` rows
 * (oldest first). Each line point is a 7-day trailing mean (`rollingMean`),
 * one per calendar day; each raw scan is a reading dot.
 *
 * Lean mass is `derived.fat_free_mass_lb` when the gateway sent it, else
 * weight less fat mass — the same definition as `leanMassLb`.
 */
export function bodyCompTrendSeries(scans = []) {
  const fatPoints = [];
  const leanPoints = [];
  for (const s of scans || []) {
    const date = utcDateString(s?.log_date || s?.measured_at);
    if (!date) continue;
    const w = Number(s.weight_value);
    const fat = Number(s.body_fat_mass_lb);
    if (Number.isFinite(fat) && s.body_fat_mass_lb != null) fatPoints.push({ date, value: fat });
    const derivedLean = s?.derived?.fat_free_mass_lb;
    const lean = typeof derivedLean === 'number'
      ? derivedLean
      : (Number.isFinite(w) && Number.isFinite(fat) && s.body_fat_mass_lb != null ? w - fat : null);
    if (typeof lean === 'number' && Number.isFinite(lean)) leanPoints.push({ date, value: Math.round(lean * 10) / 10 });
  }

  const series = (points) => {
    const smoothed = rollingMean(points, { windowDays: 7 });
    const byDay = new Map();
    for (const m of smoothed) byDay.set(utcDateString(m.date), m.mean);
    return {
      readings: smoothed.map((m) => ({ x: utcDateString(m.date), y: m.value })),
      trend: [...byDay.entries()].map(([x, y]) => ({ x, y })),
    };
  };

  const fat = series(fatPoints);
  const lean = series(leanPoints);
  const days = new Set([...fat.trend, ...lean.trend].map((p) => p.x));
  return { fat, lean, days: days.size };
}
