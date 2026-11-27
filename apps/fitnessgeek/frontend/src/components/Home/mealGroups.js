import { MEAL_ORDER } from '../../theme/theme.jsx';

/** The day's rows by meal; an unknown meal type counts as a snack. */
export function logsByMeal(logs = []) {
  const groups = Object.fromEntries(MEAL_ORDER.map((m) => [m, []]));
  for (const log of logs) {
    (groups[log?.meal_type] || groups.snack).push(log);
  }
  return groups;
}
