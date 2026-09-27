/**
 * Plain language (DOCS/SIMPLE_AND_FULL_PLAN.md item 4): sentences, not
 * formulas. No "(2100 +240)" arithmetic in a label, no day-of-year counter,
 * no truncated dates.
 */
import { MEAL_LABELS } from '../theme/theme.jsx';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');

/** "Breakfast", "Lunch", "Dinner", "Snacks". */
export const mealLabel = (mealType) => MEAL_LABELS[mealType] || 'Snacks';

/** Lower-case, for the middle of a sentence: "Added to lunch ✓". */
export const mealWord = (mealType) => (mealType === 'snack' ? 'snacks' : (MEAL_LABELS[mealType] || 'snacks').toLowerCase());

/**
 * The home screen's one question, answered in words.
 * @returns {{headline: string, detail: string, state: 'left'|'over'|'even'|'nogoal'}}
 */
export function caloriesSentence({ eaten = 0, goal = 0 }) {
  const e = Math.round(Number(eaten) || 0);
  const g = Math.round(Number(goal) || 0);
  if (!(g > 0)) {
    return {
      headline: e > 0 ? `You've had ${fmt(e)} calories today` : 'Nothing logged yet today',
      detail: e > 0 ? 'No daily target is set.' : 'Tap a meal below to add what you ate.',
      state: 'nogoal',
    };
  }
  const left = g - e;
  if (left > 0) {
    return {
      headline: `You have ${fmt(left)} calories left today`,
      detail: e > 0 ? `${fmt(e)} eaten of ${fmt(g)}` : `Your target is ${fmt(g)}`,
      state: 'left',
    };
  }
  if (left === 0) {
    return { headline: "You've hit your calories for today", detail: `${fmt(e)} eaten of ${fmt(g)}`, state: 'even' };
  }
  return {
    headline: `You're ${fmt(-left)} calories over today`,
    detail: `${fmt(e)} eaten of ${fmt(g)}`,
    state: 'over',
  };
}

/** "Added to lunch ✓ · Greek yogurt" — what the toast says after an add. */
export function addedMessage(mealType, what) {
  const base = `Added to ${mealWord(mealType)} ✓`;
  return what ? `${base} · ${what}` : base;
}

/**
 * A calendar day in words, never truncated: "Today", "Yesterday",
 * "Saturday, September 26". `day` and `today` are YYYY-MM-DD.
 */
export function friendlyDay(day, today, { withYear = false } = {}) {
  if (day === today) return 'Today';
  const [y, m, d] = String(day).split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1, 12);
  const [ty, tm, td] = String(today).split('-').map(Number);
  const t = new Date(ty, (tm || 1) - 1, td || 1, 12);
  const diff = Math.round((t - date) / 86400000);
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  return date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', ...(withYear || y !== ty ? { year: 'numeric' } : {}),
  });
}

/** "Good morning" / "Good afternoon" / "Good evening" for a local hour. */
export function greetingFor(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The meal a log at this hour most likely belongs to (same bands as the server). */
export function mealTypeForHour(hour) {
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}
