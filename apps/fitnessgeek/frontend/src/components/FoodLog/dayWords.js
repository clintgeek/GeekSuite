/**
 * Days and meals in words, for the Food Log page and Copy a meal.
 *
 * On a backfilled day the weekday comes first and the relative word goes in
 * brackets (UX review L22): "Thursday's dinner (yesterday)". The page used to
 * say "Add to yesterday's dinner" in one place and "Same as Wednesday's
 * dinner" in the next, and the jump read like two different days.
 *
 * `day` and `today` are YYYY-MM-DD calendar days; `meal` is already a word
 * ("dinner", "snacks").
 */

const parseDay = (day) => {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
};

/** Whole days from `day` back to `today`: 1 is yesterday, -1 tomorrow. */
export const daysBack = (day, today) => Math.round((parseDay(today) - parseDay(day)) / 86400000);

const weekday = (day) => parseDay(day).toLocaleDateString('en-US', { weekday: 'long' });

/** "Oct 13", with the year only when it isn't this year. */
export function shortDate(day, today) {
  const date = parseDay(day);
  const sameYear = date.getFullYear() === parseDay(today).getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * A day in the middle of a sentence: "today", "Thursday" (within the last
 * week, yesterday included), "tomorrow", else "Oct 3".
 */
export function dayName(day, today) {
  const back = daysBack(day, today);
  if (back === 0) return 'today';
  if (back === -1) return 'tomorrow';
  if (back >= 1 && back < 7) return weekday(day);
  return shortDate(day, today);
}

/**
 * "today's dinner", "Thursday's dinner (yesterday)", "Tuesday's dinner",
 * "Saturday's dinner (tomorrow)", "dinner on Oct 3".
 */
export function mealOnDayL22(meal, day, today) {
  const back = daysBack(day, today);
  if (back === 0) return `today's ${meal}`;
  if (back === 1) return `${weekday(day)}'s ${meal} (yesterday)`;
  if (back === -1) return `${weekday(day)}'s ${meal} (tomorrow)`;
  if (back > 1 && back < 7) return `${weekday(day)}'s ${meal}`;
  return `${meal} on ${shortDate(day, today)}`;
}

/**
 * "today's dinner", "Thursday's dinner", "dinner on Oct 3" — the short form,
 * for inside a longer sentence where a bracket would be one too many.
 */
export function mealOnDayShort(meal, day, today) {
  const name = dayName(day, today);
  if (name.includes(' ')) return `${meal} on ${name}`;
  return `${name}'s ${meal}`;
}
