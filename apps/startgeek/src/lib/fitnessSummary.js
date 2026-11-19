// fitnessSummary.js — what the Fitness panel says (design review 2026-11-18,
// #11). "-- / 2,100 kcal" could mean loading, nothing logged or an error.
// glanceToday sends `calories: 0` and `mealsLogged: 0` for a day with no food
// logged (basegeek glance resolvers), so that day now says so in words.

/** @returns {{ logged: boolean, calories: number|null, goal: number|null, ratio: number|null }} */
export function fitnessSummary(fitness = {}) {
  const goal = Number.isFinite(fitness.calorieGoal) && fitness.calorieGoal > 0 ? fitness.calorieGoal : null
  const raw = Number.isFinite(fitness.calories) ? fitness.calories : null
  const logged = (raw != null && raw > 0) || fitness.mealsLogged > 0
  const calories = logged ? raw ?? 0 : null
  const ratio = calories != null && goal ? Math.min(100, (calories / goal) * 100) : null
  return { logged, calories, goal, ratio }
}
