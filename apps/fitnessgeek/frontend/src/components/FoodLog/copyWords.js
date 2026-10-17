import { mealWord } from '../../utils/plainWords.js';
import { dayName, mealOnDayShort } from './dayWords.js';

/** The source meal's "Whole day" option. Never the default (UX review L3). */
export const WHOLE_DAY = 'all';

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The whole copy, as one sentence: "Copy Chef's dinner from Thursday into
 * today's dinner (3 foods)". `count` is null while it's unknown.
 */
export function copySummary({ whose, fromDate, fromMeal, toDate, toMeal, count, today }) {
  const owner = whose ? `${whose}'s` : 'your';
  const tail = count == null ? '' : ` (${plural(count, 'food')})`;
  if (fromMeal === WHOLE_DAY) {
    return `Copy ${owner} whole day from ${dayName(fromDate, today)} into ${dayName(toDate, today)}${tail}`;
  }
  const meal = mealWord(fromMeal);
  const target = mealOnDayShort(mealWord(toMeal || fromMeal), toDate, today);
  return `Copy ${owner} ${meal} from ${dayName(fromDate, today)} into ${target}${tail}`;
}

