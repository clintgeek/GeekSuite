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
      detail: e > 0 ? 'Just keeping count. There is no daily target.' : 'Add what you ate and I’ll keep count.',
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

/**
 * A blood pressure category in plain words (review D-1). `label` is for a
 * legend ("A little high"); `phrase` is for the middle of a sentence, with
 * the medical name in brackets on first mention ("a little high (elevated)").
 * Stages are bpUtils' BP_STAGES names.
 */
const BP_WORDS = {
  Normal: { label: 'Normal', phrase: 'normal' },
  Elevated: { label: 'A little high', phrase: 'a little high (elevated)' },
  'Stage 1': { label: 'High (stage 1)', phrase: 'high (stage 1)' },
  'Stage 2': { label: 'High (stage 2)', phrase: 'high (stage 2)' },
  Crisis: { label: 'Very high (crisis)', phrase: 'very high (crisis)' },
};
export function bpStageWords(stage) {
  return BP_WORDS[stage] || { label: 'Unknown', phrase: 'not readable' };
}

/* Amounts on Home's meal cards (review L4). */
const servingsOf = (food) => {
  const n = Number(food?.servings);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

/** "Egg", "Egg ×2", "Rice ×1.5" — whole or up to two decimals, never "×1". */
export function amountName(name, servings = 1) {
  const n = Math.round((Number(servings) || 1) * 100) / 100;
  return n === 1 ? name : `${name} ×${n}`;
}

/** Compact cards: identical names (ignoring case and spaces) become one line. */
export function mergeByName(foods = []) {
  const merged = [];
  const byKey = new Map();
  for (const food of foods) {
    const key = String(food?.name || '').trim().toLowerCase();
    const seen = byKey.get(key);
    if (seen) {
      seen.servings += servingsOf(food);
      seen.calories = (seen.calories || 0) + (food.calories || 0);
    } else {
      const row = { ...food, servings: servingsOf(food) };
      byKey.set(key, row);
      merged.push(row);
    }
  }
  return merged;
}
