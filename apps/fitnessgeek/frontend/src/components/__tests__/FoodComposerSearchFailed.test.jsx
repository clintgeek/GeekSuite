/**
 * A failed read is never drawn as an empty result. When the search of your
 * own foods fails, the list used to say "No match in your foods yet", which
 * reads as "you have never eaten that".
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

const suggest = vi.fn();
const search = vi.fn();
vi.mock('../../services/foodService', () => ({
  foodService: { suggest: (...a) => suggest(...a), search: (...a) => search(...a) },
}));
vi.mock('../../hooks/useToday.js', () => ({ useToday: () => '2026-10-14' }));
vi.mock('../../hooks/useRecentLogs.js', () => ({ useRecentLogs: () => ({ logs: [], meals: [], loading: false }), forgetRecentLogs: vi.fn() }));
vi.mock('../FoodSearch/useHouseholdMeals.js', () => ({ useHouseholdMeals: () => [] }));

const { default: FoodComposer } = await import('../FoodSearch/FoodComposer.jsx');
const type = (value) => fireEvent.change(screen.getByLabelText('Tell me what you ate'), { target: { value } });
const renderBox = () => render(<GeekToastProvider><FoodComposer onLogItems={vi.fn()} onDescribe={vi.fn()} /></GeekToastProvider>);

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

describe('the exact-food list when the search fails', () => {
  it('says the search failed, not "No match"', async () => {
    suggest.mockRejectedValue(new Error('Network Error'));
    search.mockResolvedValue([]);
    renderBox();
    type('eg');
    await vi.advanceTimersByTimeAsync(300);
    expect(await screen.findByTestId('search-failed')).toHaveTextContent('Couldn’t search your foods just now');
    expect(screen.queryByTestId('no-match')).toBeNull();
  });

  it('a real empty answer still says "No match", and a null row is not a row', async () => {
    suggest.mockResolvedValue([null]);
    search.mockResolvedValue([]);
    renderBox();
    type('eg');
    await vi.advanceTimersByTimeAsync(300);
    expect(await screen.findByTestId('no-match')).toHaveTextContent('No match in your foods yet');
    expect(screen.queryByTestId('food-row')).toBeNull();
  });
});
