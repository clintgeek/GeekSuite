/**
 * Which goal the weight tracker measures against when both settings stores
 * hold one. Real on 2026-09-23: an April `weight_goal` (start 307.5, the last
 * weigh-in before a nine-month gap) and the Calorie Wizard's plan from that
 * morning (start 318.6). The most recently started goal must win.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

let settings;
vi.mock('../../services/weightService', () => ({
  weightService: { getWeightLogs: async () => ({ success: true, data: [] }) },
}));
vi.mock('../../services/settingsService.js', () => ({
  settingsService: { getSettings: async () => ({ success: true, data: settings }) },
}));
const { useWeight } = await import('../useWeight.js');

const APRIL_WEIGHT_GOAL = {
  enabled: true, startWeight: 307.5, targetWeight: 220, startDate: '2026-04-09', goalDate: '2027-02-09', ratePerWeek: -2,
};
const SEPT_PLAN = {
  enabled: true, start_weight: 318.6, target_weight: 220, start_date: '2026-09-23T13:11:25.911Z',
  estimated_end_date: '2027-09-08T13:11:25.911Z', weight_change_rate: 2,
};

const goalFor = async () => {
  const { result } = renderHook(() => useWeight());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result.current.weightGoal;
};

describe('useWeight goal choice', () => {
  beforeEach(() => { settings = {}; });

  it('the Calorie Wizard plan set this morning beats an April weight goal', async () => {
    settings = { weight_goal: APRIL_WEIGHT_GOAL, nutrition_goal: SEPT_PLAN };
    const g = await goalFor();
    expect(g.startWeight).toBe(318.6);
    expect(g.goalDate).toBe(SEPT_PLAN.estimated_end_date);
  });

  it('a weight goal set after the plan beats the plan', async () => {
    settings = { weight_goal: { ...APRIL_WEIGHT_GOAL, startDate: '2026-10-01', startWeight: 315 }, nutrition_goal: SEPT_PLAN };
    expect((await goalFor()).startWeight).toBe(315);
  });

  it('either store alone is used as before', async () => {
    settings = { weight_goal: APRIL_WEIGHT_GOAL };
    expect((await goalFor()).startWeight).toBe(307.5);
    settings = { nutrition_goal: SEPT_PLAN };
    expect((await goalFor()).startWeight).toBe(318.6);
  });
});
