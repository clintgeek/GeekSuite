import { useEffect, useState } from 'react';
import { apiService } from '../../services/apiService.js';

/**
 * "Same as Chef's dinner" (L7): what each household member who shares their
 * food log logged for this meal on this day.
 *
 * "We ate the same dinner" had no path for Heather: Chef can't send it, and
 * pulling it through Copy Meal took five unlabelled steps. The household read
 * already exists (the household view uses it), so this only reads what is
 * already shared: the member list, then each sharing member's logs for the
 * day. The copy itself goes through the gateway's household copy path
 * (useFoodLogging, `type: 'household-meal'`).
 *
 * The name is the one the member chose in their household settings.
 * Anything that fails — no household, nobody sharing, a member who stopped
 * sharing — is simply no pick: this is a shortcut, never an error.
 */
const TTL_MS = 60 * 1000;
const cache = new Map();

/** Drop the cache (tests; and a member's log can change at any time). */
export function forgetHouseholdMeals() {
  cache.clear();
}

const caloriesOf = (log) => {
  const per = Number(log?.nutrition?.calories_per_serving)
    || Number(log?.food_item_id?.nutrition?.calories_per_serving)
    || 0;
  return per * (Number(log?.servings) || 1);
};

async function load(date) {
  const hit = cache.get(date);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const household = await apiService.get('/logs/household').then((r) => r?.data ?? r).catch(() => null);
  const sharing = household?.household_id
    ? (household.members || []).filter((m) => m?.user_id && m.shares_food_logs)
    : [];
  const settled = await Promise.allSettled(sharing.map((member) => (
    apiService.get(`/logs/household/${member.user_id}/${date}`).then((r) => {
      const data = r?.data ?? r;
      return { member, logs: Array.isArray(data) ? data : [] };
    })
  )));
  const value = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  if (household) cache.set(date, { at: Date.now(), value });
  return value;
}

/**
 * @returns {{userId: string, name: string, foods: string[], calories: number}[]}
 *          one per sharing member who logged `mealType` on `date`.
 */
export function useHouseholdMeals(date, mealType, { enabled = true } = {}) {
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!enabled || !date) return undefined;
    let cancelled = false;
    load(date).then((value) => {
      if (!cancelled) setMembers(value);
    }).catch(() => {
      if (!cancelled) setMembers([]);
    });
    return () => { cancelled = true; };
  }, [date, enabled]);

  return members
    .map(({ member, logs }) => {
      const meal = logs.filter((log) => log?.meal_type === mealType);
      return {
        userId: member.user_id,
        name: member.display_name || 'Household member',
        foods: meal.map((log) => log?.food_item_id?.name).filter(Boolean),
        calories: Math.round(meal.reduce((sum, log) => sum + caloriesOf(log), 0)),
        count: meal.length,
      };
    })
    .filter((m) => m.count > 0);
}

export default useHouseholdMeals;
