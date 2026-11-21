/**
 * Day keys. A GeekDay page is one LOCAL calendar day, named by its
 * `yyyy-MM-dd` key (DOCS/THE_CONTEXT.md §3.1: the browser owns the local day).
 * All arithmetic reads local calendar fields, never a UTC offset.
 */
import { localDateString } from '@geeksuite/utils';

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isDayKey = (value) => typeof value === 'string' && KEY_RE.test(value) && Boolean(keyToDate(value));

/** Today's key in the browser's zone. */
export const todayKey = (now = new Date()) => localDateString(now);

/** Local midnight of the day a key names, or null for a bad key. */
export function keyToDate(key) {
  const m = KEY_RE.exec(key || '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // 2026-02-31 rolls into March: not a real day.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** The key `days` after (or before) `key`. DST-safe: calendar arithmetic. */
export function addDays(key, days) {
  const date = keyToDate(key);
  if (!date) return key;
  return localDateString(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/**
 * The UTC offset to send with a day's task query: the offset in force on
 * THAT day (not now), JS sign convention (minutes west of UTC).
 */
export function tzOffsetFor(key) {
  const date = keyToDate(key);
  return date ? date.getTimezoneOffset() : new Date().getTimezoneOffset();
}

/**
 * The instant typed text is read against: the day on screen, at the current
 * clock time. "tomorrow" on Thursday's page means Friday, and a task typed
 * with no date lands on the page it was typed on.
 */
export function anchorFor(key, now = new Date()) {
  const date = keyToDate(key);
  if (!date) return now;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), 0);
}

/** "Friday" */
export const weekdayName = (key, locale) => keyToDate(key)?.toLocaleDateString(locale, { weekday: 'long' }) ?? '';

/** "November 20" */
export const monthDay = (key, locale) => keyToDate(key)?.toLocaleDateString(locale, { month: 'long', day: 'numeric' }) ?? '';

/** "Fri, Nov 27" — with the year only when it is not this one. */
export function shortDay(key, now = new Date(), locale) {
  const date = keyToDate(key);
  if (!date) return '';
  const options = { weekday: 'short', month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString(locale, options);
}

/** "Today", "Tomorrow", "Yesterday", or '' for any other day. */
export function relativeName(key, now = new Date()) {
  const today = todayKey(now);
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  return '';
}

/**
 * The NoteGeek title of a day's page: the date, ISO first so a title sort is
 * a date sort (spec req 7). Always English, so it never depends on the device.
 */
export function noteTitleFor(key) {
  const date = keyToDate(key);
  if (!date) return key;
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
  return `${key} ${weekday}`;
}

/** The tags a day's page carries: the family tag and the exact-match day tag. */
export const DAILY_TAG = 'daily';
export const dayTagFor = (key) => `${DAILY_TAG}/${key}`;
export const noteTagsFor = (key) => [DAILY_TAG, dayTagFor(key)];

/** Milliseconds until the next local midnight (plus a second, to land inside it). */
export function msUntilTomorrow(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}
