/**
 * What the composer reads off the words in the box, before anything is sent.
 *
 * All of it is cheap and client-side (REVIEW_2026-10 §4, "the food box,
 * redesigned"): is this a sentence or a name, does it say a day, and what do
 * we call that day out loud.
 */
import { errorMessage, transportMessage, RESTARTING_MESSAGE, TIMEOUT_MESSAGE, OFFLINE_MESSAGE, SIGNED_OUT_MESSAGE } from '../../utils/errorMessage.js';

const NUMBER_WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|dozen|a\s+couple|a\s+few)\b/;

/**
 * A sentence, not a food's name: three or more words, a number, "and",
 * "with", "&", "+" or a comma. "fage" and "greek yogurt" are names; "2 eggs",
 * "eggs and toast" and "a bowl of soup" are sentences.
 *
 * A number said as a word counts as a number (L21): "two eggs", "a couple
 * eggs", "half bagel", "a few crackers", "dozen wings". Heather says amounts
 * the way she'd tell a friend, and "two eggs" opened the list and ran a deep
 * search as if "two" were part of a name.
 *
 * In sentence mode the list folds away and the deep search does not run, so
 * typing a sentence word by word no longer fires a model call per pause (§2).
 */
export function isSentence(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  if (/\d/.test(t)) return true;
  if (/[&+,]/.test(t)) return true;
  if (/\b(and|with)\b/.test(t)) return true;
  if (NUMBER_WORDS.test(t)) return true;
  return t.split(/\s+/).filter(Boolean).length >= 3;
}

// ── Day words ──────────────────────────────────────────────────────────
// A mirror of the backend's DAY_PATTERNS (backend/src/services/
// mealDescriptionParser.js), same order, longest first. A bare weekday is not
// a day word ("Taco Tuesday" is a meal); it needs "on", "last", "this past",
// a part of the day, or a meal after it. Today words ("this morning",
// "tonight") are not listed: they need no question.
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY = `(${WEEKDAYS.join('|')})`;
const PART_OF_DAY = '(morning|afternoon|evening|night)';

const DAY_PATTERNS = [
  { re: /\b(?:on\s+|from\s+)?the\s+day\s+before\s+yesterday\b/, day: () => 'day_before_yesterday' },
  { re: new RegExp(`\\b(?:on\\s+|from\\s+)?yesterday(?:\\s+${PART_OF_DAY})?\\b`), day: () => 'yesterday' },
  { re: /\b(?:from\s+)?last\s+night\b/, day: () => 'yesterday' },
  { re: new RegExp(`\\b(?:on\\s+|from\\s+)?(?:last|this\\s+past)\\s+${WEEKDAY}(?:\\s+${PART_OF_DAY})?\\b`), day: (m) => m[1], last: true },
  { re: new RegExp(`\\b(?:on\\s+|from\\s+)?${WEEKDAY}\\s+${PART_OF_DAY}\\b`), day: (m) => m[1] },
  { re: new RegExp(`\\bon\\s+${WEEKDAY}\\b`), day: (m) => m[1] },
  { re: new RegExp(`\\b${WEEKDAY}(?=\\s+(?:for|at)\\s+(?:breakfast|lunch|dinner|supper|brunch|snack)\\b)`), day: (m) => m[1] },
];

/**
 * The first day the text names, as the backend would hint it.
 * @returns {{hint: string, words: string, last: boolean} | null}
 */
export function detectDayWords(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  for (const pattern of DAY_PATTERNS) {
    const match = t.match(pattern.re);
    if (match) return { hint: pattern.day(match), words: match[0].trim(), last: Boolean(pattern.last) };
  }
  return null;
}

const parseDay = (day) => {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
};
const isoDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shift = (day, n) => {
  const date = parseDay(day);
  date.setDate(date.getDate() + n);
  return isoDay(date);
};

/**
 * The calendar day a hint points at, counted back from `today`. A weekday is
 * its most recent one; "last Monday" said on a Monday is a week ago, a plain
 * "on Monday" said on a Monday is today.
 */
export function resolveDayHint(hint, today, { last = false } = {}) {
  if (!hint || !today) return null;
  if (hint === 'yesterday') return shift(today, -1);
  if (hint === 'day_before_yesterday') return shift(today, -2);
  const wd = WEEKDAYS.indexOf(hint);
  if (wd < 0) return null;
  let back = (parseDay(today).getDay() - wd + 7) % 7;
  if (back === 0 && last) back = 7;
  return shift(today, -back);
}

const daysBetween = (from, to) => Math.round((parseDay(to) - parseDay(from)) / 86400000);

/**
 * A day as a person says it in the middle of a sentence: "today",
 * "yesterday", "tomorrow", "Wednesday" (within the last week), else
 * "Saturday, October 3".
 */
export function dayInWords(day, today) {
  if (!day || !today) return '';
  const back = daysBetween(day, today);
  if (back === 0) return 'today';
  if (back === 1) return 'yesterday';
  if (back === -1) return 'tomorrow';
  const date = parseDay(day);
  if (back > 1 && back < 7) return date.toLocaleDateString('en-US', { weekday: 'long' });
  const sameYear = date.getFullYear() === parseDay(today).getFullYear();
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "yesterday's", "Wednesday's" — or null when the day needs "on …" instead. */
export function dayPossessive(day, today) {
  const words = dayInWords(day, today);
  if (!words || words.includes(',')) return null;
  return `${words}'s`;
}

/**
 * "lunch" today; "yesterday's lunch", "Wednesday's dinner"; "lunch on
 * Saturday, October 3" further back. `meal` is already a word ("lunch",
 * "snacks").
 */
export function mealOnDay(meal, day, today) {
  if (!day || !today || day === today) return meal;
  const possessive = dayPossessive(day, today);
  return possessive ? `${possessive} ${meal}` : `${meal} on ${dayInWords(day, today)}`;
}

// ── One way of naming days in a sheet (L22) ───────────────────────────
// On today's sheet, days are relative: "yesterday's lunch", "Log this to
// yesterday?". On a backfilled sheet the relative words collide — the title
// said "yesterday's dinner" while the quick pick said "Same as Wednesday's
// dinner" — so the whole sheet uses weekdays, and the title says which
// weekday "yesterday" was: "Add to Thursday's dinner (yesterday)".

/** `day` named for a sheet that is writing to `sheetDay`. */
export function sheetDayWords(day, today, sheetDay) {
  if (!day || !today) return '';
  const back = daysBetween(day, today);
  if (sheetDay && sheetDay !== today && back >= 1 && back < 7) {
    return parseDay(day).toLocaleDateString('en-US', { weekday: 'long' });
  }
  return dayInWords(day, today);
}

/** "lunch", "yesterday's lunch" (today's sheet), "Wednesday's dinner" (a backfilled one). */
export function sheetMealOnDay(meal, day, today, sheetDay) {
  if (!day || !today || day === today) return meal;
  const words = sheetDayWords(day, today, sheetDay);
  if (!words || words.includes(',')) return `${meal} on ${words}`;
  return `${words}'s ${meal}`;
}

/** The add sheet's title: "Add to lunch", "Add to Thursday's dinner (yesterday)". */
export function sheetTitle(meal, day, today) {
  const where = sheetMealOnDay(meal, day, today, day);
  return day && today && daysBetween(day, today) === 1 ? `Add to ${where} (yesterday)` : `Add to ${where}`;
}

// ── What a failed Log it says ──────────────────────────────────────────
export const NOTHING_TO_LOG_MESSAGE = "I couldn't find a food in that. Try naming the food, like 'chicken soup'.";
export const RETRY_MESSAGE = "That didn't go through. Tap Log it to try again.";
// "Saved here" is only true when the words outlive the sheet (L18): the draft
// keeps them in sessionStorage. Where that can't be written (a private
// window, blocked storage) the line says what will actually work.
export const OFFLINE_COMPOSER_MESSAGE = "No signal — I can't log this yet. Your words are saved here.";
export const OFFLINE_UNSAVED_MESSAGE = "No signal — I can't log this yet. Keep this open and tap Log it when you're back.";
export const STILL_WORKING_MESSAGE = "Still working — this one's taking a moment.";

const SHORT_REASON = {
  [RESTARTING_MESSAGE]: 'FitnessGeek is restarting.',
  [TIMEOUT_MESSAGE]: 'That took too long.',
  [OFFLINE_MESSAGE]: 'No signal.',
};

const statusOf = (err) => err?.response?.status ?? err?.status ?? null;

/**
 * A describe that didn't land, in plain words. A 422 is a real answer (no
 * food in the text) and says how to fix it. Signed out is its own sentence,
 * because tapping again won't help. Anything else that the server put into
 * words is shown as is; every other failure is "tap Log it to try again",
 * with the reason in front when there is one.
 *
 * @returns {{kind: 'nothing'|'signed-out'|'server'|'retry', message: string}}
 */
export function describeFailure(err) {
  const code = err?.response?.data?.error?.code;
  if (statusOf(err) === 422 || code === 'NOTHING_TO_LOG') return { kind: 'nothing', message: NOTHING_TO_LOG_MESSAGE };
  const transport = transportMessage(err);
  if (transport === SIGNED_OUT_MESSAGE) return { kind: 'signed-out', message: SIGNED_OUT_MESSAGE };
  if (transport) return { kind: 'retry', message: `${SHORT_REASON[transport] || ''} ${RETRY_MESSAGE}`.trim() };
  const status = statusOf(err);
  if (status && status >= 400 && status < 500) {
    const said = errorMessage(err, null);
    if (said) return { kind: 'server', message: said };
  }
  return { kind: 'retry', message: RETRY_MESSAGE };
}
