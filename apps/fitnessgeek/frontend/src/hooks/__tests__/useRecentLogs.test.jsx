/**
 * The Again chips' source. Two ways it used to go wrong (REVIEW_2026-10 P2):
 *   - a failed read was cached as "no history" for two minutes, so the chips
 *     vanished after every deploy blip;
 *   - a food deleted since was still offered, and tapping it failed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const get = vi.fn();
vi.mock('../../services/apiService.js', () => ({ apiService: { get: (...a) => get(...a) } }));

const { useRecentLogs, forgetRecentLogs } = await import('../useRecentLogs.js');

const log = (id, food) => ({ id, meal_type: 'lunch', servings: 1, log_date: '2026-10-15T00:00:00.000Z', food_item_id: food });

beforeEach(() => {
  forgetRecentLogs();
  get.mockReset();
});

describe('useRecentLogs', () => {
  it('does not remember a failed read as an empty history', async () => {
    get.mockRejectedValueOnce(new Error('Request failed with status code 502'))
      .mockResolvedValueOnce({ data: [] });
    const first = renderHook(() => useRecentLogs('2026-10-16'));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.logs).toEqual([]);

    get.mockImplementation(async (url) => ({ data: url.startsWith('/logs') ? [log('l1', { id: 'egg', name: 'Egg' })] : [] }));
    const second = renderHook(() => useRecentLogs('2026-10-16'));
    await waitFor(() => expect(second.result.current.logs).toHaveLength(1));
  });

  it('keeps a clean answer for the next open', async () => {
    get.mockResolvedValue({ data: [] });
    const first = renderHook(() => useRecentLogs('2026-10-16'));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    const calls = get.mock.calls.length;
    const second = renderHook(() => useRecentLogs('2026-10-16'));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(get.mock.calls.length).toBe(calls);
  });

  it('does not offer a food that has been deleted since', async () => {
    get.mockImplementation(async (url) => ({
      data: url.startsWith('/logs')
        ? [log('l1', { id: 'egg', name: 'Egg' }), log('l2', { id: 'old', name: 'Old soup', is_deleted: true })]
        : [],
    }));
    const { result } = renderHook(() => useRecentLogs('2026-10-16'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs.map((l) => l.id)).toEqual(['l1']);
  });
});
