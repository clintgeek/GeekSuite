/**
 * useWeight's `currentWeight` is the latest 7-day trailing mean, not the
 * latest raw reading (BODY_DATA_PLAN §0) — it drives "% complete" and "to go".
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../services/weightService', () => ({
  weightService: {
    getWeightLogs: async () => ({
      success: true,
      data: [
        { id: 'a', log_date: '2026-09-16T00:00:00.000Z', weight_value: 200 },
        { id: 'b', log_date: '2026-09-18T00:00:00.000Z', weight_value: 198 },
        { id: 'c', log_date: '2026-09-20T00:00:00.000Z', weight_value: 202 }, // a water day
      ],
    }),
  },
}));
vi.mock('../../services/settingsService.js', () => ({
  settingsService: { getSettings: async () => ({ success: true, data: {} }) },
}));

const { useWeight } = await import('../useWeight.js');

describe('useWeight currentWeight', () => {
  it('is the 7-day mean at the latest log', async () => {
    const { result } = renderHook(() => useWeight());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.currentWeight).toBe(200);
  });
});
