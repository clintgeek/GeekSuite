import { caloriesSentence, fmt } from '../../utils/plainWords.js';

/**
 * "What is left", in words, for the day on screen.
 *
 * Today it is plainWords' caloriesSentence ("You have 660 calories left
 * today"). Another day never says "today": a day gone by is said in the past
 * ("You had 660 calories left", "You were 120 calories over"), a day ahead
 * in the present ("You have 2,340 calories left").
 *
 * @returns {{headline: string, detail: string, state: 'left'|'over'|'even'|'nogoal'}}
 */
export function leftSentence({ eaten = 0, goal = 0, day, today }) {
  if (!day || !today || day === today) return caloriesSentence({ eaten, goal });
  const past = day < today;
  const e = Math.round(Number(eaten) || 0);
  const g = Math.round(Number(goal) || 0);
  if (!(g > 0)) {
    return {
      headline: e > 0 ? `${past ? 'You had' : 'You’ve had'} ${fmt(e)} calories` : 'Nothing logged for this day',
      detail: e > 0 ? 'Just keeping count. There is no daily target.' : 'Add what you ate and I’ll keep count.',
      state: 'nogoal',
    };
  }
  const left = g - e;
  const detail = e > 0 ? `${fmt(e)} eaten of ${fmt(g)}` : `Your target is ${fmt(g)}`;
  if (left > 0) return { headline: `${past ? 'You had' : 'You have'} ${fmt(left)} calories left`, detail, state: 'left' };
  if (left === 0) return { headline: past ? 'You hit your calories' : 'You’ve hit your calories', detail, state: 'even' };
  return { headline: `${past ? 'You were' : 'You’re'} ${fmt(-left)} calories over`, detail, state: 'over' };
}

/** The small caption over the sentence: what the ring's number is. */
export function ringCaption({ hasGoal, over, day, today }) {
  const isToday = !day || day === today;
  if (!hasGoal) return isToday ? 'Eaten today' : 'Eaten';
  if (over) return isToday ? 'Over target today' : 'Over target';
  return isToday ? 'Amount left today' : 'Amount left';
}

/**
 * The card's title. With no target there is nothing "left": the ring's
 * number is what was eaten, and the title says so (an empty day used to read
 * "What's left today: 0 calories").
 */
export const leftTitle = (day, today, hasGoal = true) => {
  if (!day || day === today) return hasGoal ? 'What’s left today' : 'Eaten today';
  return 'Calories for this day';
};
