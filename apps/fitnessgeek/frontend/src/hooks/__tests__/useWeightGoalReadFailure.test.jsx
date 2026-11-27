/**
 * A goal that could not be READ is not "no goal". The reload behind every
 * saved weigh-in re-reads settings; when that read failed, the hook cleared
 * the goal and the page offered to set a first one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const { getWeightLogs, getSettings } = vi.hoisted(() => ({ getWeightLogs: vi.fn(), getSettings: vi.fn() }));
vi.mock('../../services/weightService', () => ({ weightService: { getWeightLogs } }));
vi.mock('../../services/settingsService.js', () => ({ settingsService: { getSettings } }));

const { useWeight } = await import('../useWeight.js');

const GOAL = {
  nutrition_goal: { enabled: true, start_weight: 210, target_weight: 180, start_date: '2026-09-01', weight_change_rate: 1 },
};

beforeEach(() => {
  getWeightLogs.mockReset();
  getSettings.mockReset();
  getWeightLogs.mockResolvedValue({ success: true, data: [{ id: 'a', log_date: '2026-09-16T00:00:00.000Z', weight_value: 200 }] });
});

describe('useWeight when the goal cannot be read', () => {
  it('keeps the goal on screen through a failed refresh, and says the read failed', async () => {
    getSettings.mockResolvedValueOnce({ success: true, data: GOAL });
    const { result } = renderHook(() => useWeight());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.weightGoal?.targetWeight).toBe(180);
    expect(result.current.goalLoadFailed).toBe(false);

    getSettings.mockRejectedValueOnce(new Error('Failed to fetch'));
    await act(async () => { await result.current.loadWeightData({ silent: true }); });
    expect(result.current.weightGoal?.targetWeight).toBe(180);
    expect(result.current.goalLoadFailed).toBe(true);

    getSettings.mockResolvedValueOnce({ success: true, data: GOAL });
    await act(async () => { await result.current.loadWeightData({ silent: true }); });
    expect(result.current.goalLoadFailed).toBe(false);
  });

  it('a first load that fails reports it, so the page need not say "no goal"', async () => {
    getSettings.mockRejectedValue(new Error('Failed to fetch'));
    const { result } = renderHook(() => useWeight());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.weightGoal).toBeNull();
    expect(result.current.goalLoadFailed).toBe(true);
  });
});
