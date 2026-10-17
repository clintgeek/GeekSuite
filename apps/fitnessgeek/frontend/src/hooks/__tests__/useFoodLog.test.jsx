/**
 * B19: a failed refresh replaced the day with [] ("my food is gone"), and an
 * answer for a day no longer on screen was written over the one that is.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const getLogsForDate = vi.fn();
vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: { getLogsForDate: (...a) => getLogsForDate(...a) }
}));
vi.mock('../../services/settingsService.js', () => ({ settingsService: { getSettings: vi.fn().mockResolvedValue({ data: {} }) } }));
vi.mock('../../services/goalsService.js', () => ({ goalsService: { getDerivedMacros: vi.fn().mockResolvedValue({}) } }));
vi.mock('../../services/foodService.js', () => ({ foodService: { getFavorites: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../utils/logger.js', () => ({ default: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const { useFoodLog } = await import('../useFoodLog.js');

const row = (id, meal = 'breakfast') => ({ id, meal_type: meal, servings: 1, food_item_id: { id: 'f', name: id } });

beforeEach(() => getLogsForDate.mockReset());

describe('useFoodLog', () => {
  it('keeps the rows on screen when a refresh fails, and says so', async () => {
    getLogsForDate.mockResolvedValueOnce({ success: true, data: [row('Egg')] });
    const { result } = renderHook(() => useFoodLog('2026-10-16'));
    await waitFor(() => expect(result.current.logs).toHaveLength(1));
    expect(result.current.loadProblem).toBeNull();

    getLogsForDate.mockRejectedValueOnce(new Error('Request failed with status code 502'));
    await act(async () => { await result.current.refreshLogs(); });

    expect(result.current.logs).toHaveLength(1);
    expect(result.current.loadProblem).toBe('Couldn’t refresh — showing what was here before.');
  });

  it('says so when a day never loaded, rather than showing an empty day as fact', async () => {
    getLogsForDate.mockRejectedValueOnce(new Error('Network Error'));
    const { result } = renderHook(() => useFoodLog('2026-10-16'));
    await waitFor(() => expect(result.current.loadProblem).toBe('Couldn’t load this day. Try again in a moment.'));
    expect(result.current.logs).toEqual([]);
  });

  it('drops a late answer for a day that is no longer on screen', async () => {
    let answerTuesday;
    getLogsForDate.mockImplementation((date) => (date === '2026-10-14'
      ? new Promise((resolve) => { answerTuesday = resolve; })
      : Promise.resolve({ success: true, data: [row('Wednesday toast')] })));

    const { result, rerender } = renderHook(({ date }) => useFoodLog(date), { initialProps: { date: '2026-10-14' } });
    rerender({ date: '2026-10-15' });
    await waitFor(() => expect(result.current.logs.map((l) => l.id)).toEqual(['Wednesday toast']));

    await act(async () => { answerTuesday({ success: true, data: [row('Tuesday eggs')] }); });
    expect(result.current.logs.map((l) => l.id)).toEqual(['Wednesday toast']);
  });
});
