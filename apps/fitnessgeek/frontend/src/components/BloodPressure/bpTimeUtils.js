/**
 * Small time helpers for the blood-pressure forms and list.
 *
 * Deliberately NOT in `utils/bpUtils.js` — that file is `categorizeBP`'s home
 * and is off-limits tonight (see its header: four divergent implementations
 * were just consolidated into one, and its evaluation order is a safety
 * property). This file does one unrelated thing: turning the two native
 * inputs (`<input type="date">`, `<input type="time">`) into the single
 * `measured_at` instant the backend now requires, and back again for the
 * edit dialog's prefill.
 *
 * WHY LOCAL TIME, NOT UTC
 * -----------------------
 * `measured_at` is an INSTANT (`DOCS/THE_CONTEXT.md` §3.1) — the exact moment
 * the cuff was read — so it is entered and displayed in the reader's own
 * timezone, unlike `log_date` (a UTC-midnight calendar date, always rendered
 * with `displayCalendarDate`'s forced `timeZone: 'UTC'`). A bare
 * `new Date(`${date}T${time}`)`, with no trailing `Z`, is parsed by every
 * browser as LOCAL time — exactly what a person typing a wall-clock time
 * means — and `.toISOString()` then converts that instant to the UTC string
 * the wire format wants. No manual offset arithmetic anywhere in this file;
 * see `packages/utils/src/dates.js`'s header for why that arithmetic is a
 * trap even when it happens to be correct.
 */

const pad = (n) => String(n).padStart(2, '0');

/**
 * Is this instant "some time on this calendar day", rather than a real
 * wall-clock time someone recorded?
 *
 * THE BACKFILL MADE THIS NECESSARY
 * --------------------------------
 * Every row written before 2026-09 had no `measured_at` at all, and
 * `scripts/backfillBloodPressureMeasuredAt.js` seeded each one from its own
 * `log_date` — UTC midnight — because a calendar day is genuinely all those
 * rows ever knew. That is honest in the database and a LIE on screen: for a
 * reader in Central, UTC midnight renders as `7:00 PM` on the PREVIOUS day,
 * so all 79 historical readings would have displayed a precise evening time
 * nobody ever measured, and opening one in the edit dialog would have
 * pre-filled the day before the reading actually belongs to — turning a
 * cosmetic lie into a silent data change on the next Save.
 *
 * The rest of this file was written to degrade gracefully when `measured_at`
 * is MISSING. After the backfill it is never missing, so those branches went
 * dead exactly when they were needed. This predicate is what routes the
 * backfilled rows back into them.
 *
 * A reading genuinely taken at 00:00:00.000 UTC is indistinguishable from a
 * backfilled one and will show no time. That is a real (if vanishingly rare)
 * loss, and it is the right trade: the failure mode is "no time shown" rather
 * than "wrong time shown".
 *
 * The one-minute window covers the migration's collision nudge — it moves a
 * would-be duplicate forward a second at a time, so a nudged row sits at
 * 00:00:0X UTC and is just as day-resolution as its neighbour. (This database
 * nudged none, but another user's need not be so tidy.)
 */
export function isDayResolutionInstant(measuredAt) {
  if (!measuredAt) return false;
  const d = measuredAt instanceof Date ? measuredAt : new Date(measuredAt);
  if (Number.isNaN(d.getTime())) return false;
  const msIntoUtcDay =
    d.getUTCHours() * 3600000 +
    d.getUTCMinutes() * 60000 +
    d.getUTCSeconds() * 1000 +
    d.getUTCMilliseconds();
  return msIntoUtcDay < 60000;
}

/** `HH:MM` for right now, local time — the form's default so entry is just
 * three numbers and Save. */
export function nowLocalTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Combine a `YYYY-MM-DD` date and an `HH:MM` time — both read straight off
 * native inputs, both already in the viewer's local timezone — into the full
 * ISO-8601 UTC instant `measured_at` wants.
 *
 * @param {string} date `YYYY-MM-DD`
 * @param {string} [time] `HH:MM`, defaults to midnight if omitted
 * @returns {string|null} an ISO-8601 UTC instant, or `null` if `date` is missing/unparseable
 */
export function combineDateTimeToISO(date, time) {
  if (!date) return null;
  const t = time || '00:00';
  const local = new Date(`${date}T${t}:00`);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

/**
 * Split a stored `measured_at` instant back into the local `{ date, time }`
 * pair the two native inputs take, for pre-filling the edit dialog.
 *
 * @param {string|Date} measuredAt
 * @returns {{ date: string, time: string }} empty strings if unparseable/missing
 */
export function splitInstantToLocal(measuredAt) {
  if (!measuredAt) return { date: '', time: '' };
  const d = measuredAt instanceof Date ? measuredAt : new Date(measuredAt);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  // A backfilled row knows its DAY and not its time. Read the day off the
  // UTC fields — converting to local here is what would shift it backwards —
  // and hand back a blank time so the dialog asks instead of inventing.
  if (isDayResolutionInstant(d)) {
    return {
      date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      time: '',
    };
  }
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * `h:mm AM/PM` for an instant, in the viewer's local time — what `BPLogList`
 * shows beside the date. Returns `''` for a missing/unparseable instant so a
 * legacy row (or a row from a stage of the rollout that hasn't started
 * sending `measured_at` yet) degrades to "no time shown", not a crash or a
 * fabricated time.
 *
 * @param {string|Date} measuredAt
 * @returns {string}
 */
export function formatLocalTime(measuredAt) {
  if (!measuredAt) return '';
  const d = measuredAt instanceof Date ? measuredAt : new Date(measuredAt);
  if (Number.isNaN(d.getTime())) return '';
  // Day-resolution rows show no time, for the same reason a missing one
  // doesn't: showing `7:00 PM` for a reading whose time was never recorded is
  // a fabricated measurement, not a formatting nicety.
  if (isDayResolutionInstant(d)) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
