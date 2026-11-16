/**
 * The household's calendar day — SUITE_REVIEW_2026-11 decision S-D4.
 *
 * This process runs in UTC, so a "today" taken from the UTC date is already
 * tomorrow from about 6-7 PM US Central: a warranty due today read "Overdue
 * by a day". The household lives in one time zone, so the gateway assumes
 * one, from ONE setting:
 *
 *   HOUSEHOLD_TIME_ZONE   an IANA zone; default America/Chicago.
 *
 * An unset, empty or unknown zone falls back to the default (never to UTC):
 * a typo must not quietly bring the evening bug back.
 *
 * `householdToday()` answers with the local calendar day expressed as UTC
 * midnight — the same shape every stored calendar date in the suite has —
 * so date arithmetic written against UTC-midnight dates is unchanged.
 */

export const DEFAULT_HOUSEHOLD_TIME_ZONE = 'America/Chicago';

function isKnownZone(zone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The configured household zone (validated), or the default. */
export function householdTimeZone(env = process.env) {
  const zone = typeof env?.HOUSEHOLD_TIME_ZONE === 'string' ? env.HOUSEHOLD_TIME_ZONE.trim() : '';
  return zone && isKnownZone(zone) ? zone : DEFAULT_HOUSEHOLD_TIME_ZONE;
}

/** The household's calendar day at `now`, as a UTC-midnight Date. */
export function householdToday(now = new Date(), timeZone = householdTimeZone()) {
  const zone = isKnownZone(timeZone) ? timeZone : DEFAULT_HOUSEHOLD_TIME_ZONE;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}
