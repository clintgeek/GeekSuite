/**
 * Full's "Just added" strip on the meal card (REVIEW_2026-10 Phase 2.11).
 * A clean describe closes the sheet; the strip on the meal it landed in shows
 * each entry with Fix, plus Undo and Done, and stays until the next action —
 * never on a timer.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GeekToastProvider } from '@geeksuite/ui';
import MealCards from '../../Home/MealCards.jsx';
import { useJustAdded } from '../useJustAdded.jsx';

const DAY = '2026-10-14';
const ENTRY = {
  mealType: 'lunch',
  date: DAY,
  heard: null,
  items: [
    { logId: 'soup', name: 'Chicken soup', calories: 220, nutrition: { calories_per_serving: 220 }, servings: 1, mealType: 'lunch', date: DAY },
    { logId: 'crk', name: 'Crackers', calories: 130, nutrition: { calories_per_serving: 130 }, servings: 1, mealType: 'lunch', date: DAY },
  ],
};

const undoLogs = vi.fn();
const setLogCalories = vi.fn();
const describeMeal = vi.fn();
let api = null;

function Home({ date = DAY }) {
  const justAdded = useJustAdded({ setLogCalories, describeMeal, undoLogs });
  api = justAdded;
  return <MealCards meals={{}} date={date} onAdd={vi.fn()} justAdded={justAdded} />;
}

const renderHome = (props) => render(
  <GeekToastProvider>
    <MemoryRouter><Home {...props} /></MemoryRouter>
  </GeekToastProvider>
);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  undoLogs.mockResolvedValue({ deleted: ['soup', 'crk'], failed: [] });
  setLogCalories.mockResolvedValue({ calories_per_serving: 300 });
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); api = null; });

describe('the "Just added" strip', () => {
  it('shows on the meal it landed in — only that one — with Fix on each entry', async () => {
    renderHome();
    await act(async () => { api.show(ENTRY); });
    const strip = within(screen.getByTestId('meal-card-lunch')).getByTestId('just-added');
    expect(within(strip).getAllByTestId('entry-row').map((r) => r.textContent)).toEqual(['Chicken soup220 calFix', 'Crackers130 calFix']);
    expect(within(screen.getByTestId('meal-card-dinner')).queryByTestId('just-added')).toBeNull();
  });

  it('stays until the next action, not on a timer', async () => {
    renderHome();
    await act(async () => { api.show(ENTRY); });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(screen.getByTestId('just-added')).toBeInTheDocument();
    // Another add says show(null).
    await act(async () => { api.show(null); });
    expect(screen.queryByTestId('just-added')).toBeNull();
  });

  it('Done puts it away', async () => {
    renderHome();
    await act(async () => { api.show(ENTRY); });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('just-added')).toBeNull();
  });

  it('Undo takes back exactly those entries and says "Undone ✓"', async () => {
    renderHome();
    await act(async () => { api.show(ENTRY); });
    fireEvent.click(within(screen.getByTestId('just-added')).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(undoLogs).toHaveBeenCalledWith(['soup', 'crk']));
    expect(await screen.findByText('Undone ✓')).toBeInTheDocument();
    expect(screen.queryByTestId('just-added')).toBeNull();
  });

  it('Fix opens the one small sheet, and a new number shows on the strip', async () => {
    renderHome();
    await act(async () => { api.show(ENTRY); });
    fireEvent.click(screen.getByRole('button', { name: 'Fix Chicken soup' }));
    const sheet = await screen.findByTestId('fix-sheet');
    fireEvent.change(within(sheet).getByLabelText('Calories'), { target: { value: '300' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(setLogCalories).toHaveBeenCalledWith('soup', { calories_per_serving: 220 }, 1, 300));
    await waitFor(() => expect(within(screen.getByTestId('just-added')).getAllByTestId('entry-row')[0]).toHaveTextContent('300 cal'));
  });

  it('drops an entry deleted elsewhere, and goes when the last one does', async () => {
    renderHome();
    await act(async () => { api.show(ENTRY); });
    await act(async () => { api.forget('soup'); });
    const strip = within(screen.getByTestId('meal-card-lunch')).getByTestId('just-added');
    expect(within(strip).getAllByTestId('entry-row').map((r) => r.textContent)).toEqual(['Crackers130 calFix']);
    await act(async () => { api.forget('crk'); });
    expect(screen.queryByTestId('just-added')).toBeNull();
  });

  it('is not shown on another day', async () => {
    renderHome({ date: '2026-10-13' });
    await act(async () => { api.show(ENTRY); });
    expect(screen.queryByTestId('just-added')).toBeNull();
  });
});
