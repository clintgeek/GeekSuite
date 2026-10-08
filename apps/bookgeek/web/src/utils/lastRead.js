/**
 * "Last read" — the book's `dateFinished`, relabelled and editable (Chef,
 * 2026-10-08). A re-read moves it forward; there is no separate field.
 *
 * The one rule: **a day the reader picks is stored as UTC midnight of that
 * calendar day.** `formatReadingDate` (views/detail/bookFacts.js) reads a value
 * at exactly UTC midnight as a calendar day, in UTC, so it shows on the same
 * day in every timezone — and all 90 imported finish dates already look like
 * that. "Today" is the viewer's LOCAL calendar date (9 PM Central on Oct 8 is
 * Oct 8, though UTC says Oct 9), then stored as that day's UTC midnight.
 */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` (a date input's value) → that day's UTC midnight ISO; blank → null. */
export function calendarDayToIso(day) {
  if (day == null || day === "") return null;
  const m = DAY.exec(String(day).trim());
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Reject 2026-02-31 and friends rather than letting Date roll them over.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString();
}

/** The viewer's local "today", as UTC midnight of that calendar day. */
export function todayAsCalendarIso(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString();
}

const pad = (n) => String(n).padStart(2, "0");

/**
 * A stored reading date → `YYYY-MM-DD` for a date input, on the day
 * `formatReadingDate` shows: UTC midnight is a calendar day (UTC parts);
 * anything else is an instant (local parts). Empty → "".
 */
export function isoToCalendarDay(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const utcMidnight =
    date.getUTCHours() === 0 && date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
  return utcMidnight
    ? `${ date.getUTCFullYear() }-${ pad(date.getUTCMonth() + 1) }-${ pad(date.getUTCDate()) }`
    : `${ date.getFullYear() }-${ pad(date.getMonth() + 1) }-${ pad(date.getDate()) }`;
}

/**
 * The update a shelf move sends. Moving to `read` with no last-read date fills
 * in today, in the same mutation; a book that already has one keeps it (that's
 * a re-read — the toast asks instead). An explicit `dateFinished` in `extra`
 * (Undo restoring the old one) always wins.
 */
export function shelfMoveInput(book, newShelf, extra = {}, now = new Date()) {
  const input = { shelf: newShelf, ...extra };
  const autoFilled =
    newShelf === "read" && !("dateFinished" in extra) && !book?.dateFinished;
  if (autoFilled) input.dateFinished = todayAsCalendarIso(now);
  return { input, autoFilled };
}
