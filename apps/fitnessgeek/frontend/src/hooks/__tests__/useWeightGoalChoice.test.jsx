/**
 * Which goal the weight tracker measures against when both settings stores
 * hold one. Real on 2026-09-23: an April `weight_goal` (start 307.5, the last
 * weigh-in before a nine-month gap) and the Calorie Wizard's plan from that
 * morning (start 318.6). The most recently started goal must win.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// West of UTC, so a calendar day sent as UTC midnight is "yesterday" on the
// local calendar: the bug cannot hide on a UTC runner.
process.env.TZ = 'America/Chicago';
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

  it('B1: a goal set in the quick target today beats a weight goal stamped later the same day', async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    // What the gateway sends: its Date scalar serialises the stored day as an ISO timestamp.
    const sentToday = `${today}T00:00:00.000Z`;
    const laterToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30).toISOString();
    settings = {
      weight_goal: { ...APRIL_WEIGHT_GOAL, startDate: laterToday, targetWeight: 200 },
      nutrition_goal: { ...SEPT_PLAN, start_date: sentToday, target_weight: 165 },
    };
    expect((await goalFor()).targetWeight).toBe(165);
  });

  it('B1: a weight goal dated in the future does not hide the goal set today', async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    // What the gateway sends: its Date scalar serialises the stored day as an ISO timestamp.
    const sentToday = `${today}T00:00:00.000Z`;
    settings = {
      weight_goal: { ...APRIL_WEIGHT_GOAL, startDate: `${now.getFullYear() + 1}-01-15`, targetWeight: 200 },
      nutrition_goal: { ...SEPT_PLAN, start_date: sentToday, target_weight: 165 },
    };
    expect((await goalFor()).targetWeight).toBe(165);
  });

  it('either store alone is used as before', async () => {
    settings = { weight_goal: APRIL_WEIGHT_GOAL };
    expect((await goalFor()).startWeight).toBe(307.5);
    settings = { nutrition_goal: SEPT_PLAN };
    expect((await goalFor()).startWeight).toBe(318.6);
  });
});
