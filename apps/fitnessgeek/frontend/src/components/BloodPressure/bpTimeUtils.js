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
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
