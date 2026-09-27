/**
 * Simple and Full — which face of the app a person sees
 * (DOCS/SIMPLE_AND_FULL_PLAN.md, Decisions).
 *
 * A person who has CHOSEN gets what they chose. A person who never chose gets
 * a default read off their own history: Full if they have logged anything in
 * the last 90 days, otherwise Simple. No user id is hard-coded anywhere; Chef
 * lands in Full because he logs, and Heather in Simple because she hasn't yet.
 *
 * Pure functions, no network: the provider (contexts/ExperienceContext.jsx)
 * fetches, this decides.
 */

export const EXPERIENCE_MODES = Object.freeze(['simple', 'full']);
export const RECENT_ACTIVITY_DAYS = 90;
export const FIRST_RUN_GOALS = Object.freeze(['lose', 'maintain', 'track']);

export const isExperienceMode = (value) => EXPERIENCE_MODES.includes(value);

/**
 * `YYYY-MM-DD` n calendar days before `day` (also `YYYY-MM-DD`). Built from
 * the parts at local noon so a DST change can never move it a whole day.
 */
export function daysBefore(day, n) {
  const [y, m, d] = String(day).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1, 12);
  date.setDate(date.getDate() - n);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/**
 * The calendar day a stored row belongs to. Every fitnessgeek log date is the
 * UTC midnight of the person's calendar day, so its first ten characters ARE
 * that day, whatever timezone this browser is in.
 */
export const rowDay = (row) => {
  const raw = row?.log_date ?? row?.date ?? null;
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw.toISOString().slice(0, 10);
  const text = String(raw);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};

/**
 * Has this person logged anything — food, a weight, a blood pressure — in the
 * `days` calendar days up to and including `today`?
 */
export function hasRecentActivity({ foodLogs = [], weights = [], bloodPressures = [] } = {}, today, days = RECENT_ACTIVITY_DAYS) {
  const cutoff = daysBefore(today, days);
  const recent = (rows) => (Array.isArray(rows) ? rows : []).some((row) => {
    const day = rowDay(row);
    return day !== null && day >= cutoff;
  });
  return recent(foodLogs) || recent(weights) || recent(bloodPressures);
}

/**
 * The mode this person sees.
 *
 * @param {{savedMode?: string|null, activity?: object, today: string}} input
 * @returns {'simple'|'full'}
 */
export function decideMode({ savedMode, activity, today }) {
  if (isExperienceMode(savedMode)) return savedMode;
  return hasRecentActivity(activity, today) ? 'full' : 'simple';
}
