import { addDays, format, startOfWeek } from 'date-fns';
import { localDateString } from '@geeksuite/utils';

/**
 * The week a weekly review is about.
 *
 * BuJoGeek's weeks start on Monday everywhere else in the app, and the
 * `reviewDraft` gateway query *insists* on a Monday — it reads Monday-to-Sunday
 * from whatever it is given and rejects anything else, so a client that sent a
 * Wednesday would be asking about seven days nobody was looking at.
 *
 * The value that crosses the wire is `localDateString(...)`, not
 * `toISOString()`: the Monday meant is the user's own Monday. West of UTC, a
 * `toISOString()` on local midnight is still Sunday, which the gateway would
 * (correctly) reject — the same class of bug as BURN_REVIEW #8.
 */
export function currentWeekStart(now = new Date()) {
  return startOfWeek(now, { weekStartsOn: 1 });
}

/** `yyyy-MM-dd` for the Monday, in the user's own timezone. */
export function weekStartKey(weekStart) {
  return localDateString(weekStart);
}

/** "31 Aug – 6 Sep" — how the week is named on screen. */
export function weekLabel(weekStart) {
  return `${format(weekStart, 'd MMM')} – ${format(addDays(weekStart, 6), 'd MMM')}`;
}
