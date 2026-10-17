/**
 * L7: what "Same as Chef's dinner" is made of — the existing household reads,
 * and only members who share their food log and logged this meal that day.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const get = vi.fn();
vi.mock('../../../services/apiService.js', () => ({ apiService: { get: (...a) => get(...a) } }));

const { useHouseholdMeals, forgetHouseholdMeals } = await import('../useHouseholdMeals.js');

const HOUSEHOLD = {
  household_id: 'H1',
  members: [
    { user_id: 'chef-1', display_name: 'Chef', shares_food_logs: true },
    { user_id: 'kid-2', display_name: 'Sam', shares_food_logs: false },
  ],
};
const log = (meal, name, cal, servings = 1) => ({ meal_type: meal, servings, nutrition: { calories_per_serving: cal }, food_item_id: { name } });

beforeEach(() => {
  forgetHouseholdMeals();
  get.mockReset();
});

describe('useHouseholdMeals', () => {
  it("reads the household, then each sharing member's day; keeps only this meal", async () => {
    get.mockImplementation(async (url) => {
      if (url === '/logs/household') return { success: true, data: HOUSEHOLD };
      if (url === '/logs/household/chef-1/2026-10-14') {
        return { success: true, data: [log('dinner', 'Steak', 600), log('dinner', 'Salad', 150, 2), log('lunch', 'Soup', 220)] };
      }
      throw new Error(`unexpected ${url}`);
    });
    const { result } = renderHook(() => useHouseholdMeals('2026-10-14', 'dinner'));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toEqual({ userId: 'chef-1', name: 'Chef', foods: ['Steak', 'Salad'], calories: 900, count: 2 });
    // The member who doesn't share is never asked about.
    expect(get).not.toHaveBeenCalledWith('/logs/household/kid-2/2026-10-14');
  });

  it('no household, or a failed read, is no pick — never an error', async () => {
    get.mockResolvedValueOnce({ success: true, data: { household_id: null, members: [] } });
    const { result } = renderHook(() => useHouseholdMeals('2026-10-14', 'dinner'));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual([]);

    forgetHouseholdMeals();
    get.mockRejectedValueOnce(new Error('502'));
    const second = renderHook(() => useHouseholdMeals('2026-10-15', 'dinner'));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(second.result.current).toEqual([]);
  });
});
