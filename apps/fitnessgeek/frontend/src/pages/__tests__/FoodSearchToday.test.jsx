/**
 * B3 on the full-page search: it logs to "today", and "today" was computed
 * once at mount — so a PWA left open overnight logged breakfast to yesterday.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

const dates = [];
vi.mock('../../components/FoodSearch', () => ({ UnifiedFoodSearch: () => null }));
vi.mock('../../components/BarcodeScanner/BarcodeScanner.jsx', () => ({ default: () => null }));
vi.mock('../../hooks/useFoodLogging.js', () => ({
  useFoodLogging: ({ date }) => {
    dates.push(date);
    return { logItems: vi.fn(), undoLogs: vi.fn(), describeMeal: vi.fn(), adjustLogCalories: vi.fn(), createFood: vi.fn() };
  }
}));

const { default: FoodSearchPage } = await import('../FoodSearch.jsx');

afterEach(() => vi.useRealTimers());

describe('the search page logs to the real today', () => {
  it('picks up the new day when the app comes back in the morning', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 9, 15, 22, 0));
    render(<GeekToastProvider><FoodSearchPage /></GeekToastProvider>);
    expect(dates[dates.length - 1]).toBe('2026-10-15');

    vi.setSystemTime(new Date(2026, 9, 16, 7, 30));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(dates[dates.length - 1]).toBe('2026-10-16');
  });
});
