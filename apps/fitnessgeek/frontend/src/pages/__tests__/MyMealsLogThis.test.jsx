/**
 * My Meals says "Save your favorite combinations and reuse them in a single
 * tap" and had no way to log one (REVIEW_2026-10 P2 / Phase 2.15). "Log this"
 * goes through the same logItems → logMeal path as the add box's Again chips.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';
import { localDateString } from '@geeksuite/utils';

const addMealToLog = vi.fn();
const deleteFoodLog = vi.fn();
const getMeals = vi.fn();
vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: {
    getMeals: (...a) => getMeals(...a),
    addMealToLog: (...a) => addMealToLog(...a),
    deleteFoodLog: (...a) => deleteFoodLog(...a),
    deleteMeal: vi.fn(),
    updateMeal: vi.fn()
  }
}));
vi.mock('../../services/foodService.js', () => ({ foodService: { describe: vi.fn(), create: vi.fn() } }));
vi.mock('../../hooks/useRecentLogs.js', () => ({ forgetRecentLogs: vi.fn() }));

const { default: MyMeals } = await import('../MyMeals.jsx');

const TACO = { id: 'meal-1', name: 'Taco night', meal_type: 'dinner', food_items: [] };

beforeEach(() => {
  vi.clearAllMocks();
  getMeals.mockResolvedValue([TACO]);
  addMealToLog.mockResolvedValue({ success: true, data: { logs: [{ id: 'l1' }, { id: 'l2' }] } });
  deleteFoodLog.mockResolvedValue({ success: true });
});

const renderPage = () => render(<GeekToastProvider><MyMeals /></GeekToastProvider>);

describe('My Meals: Log this', () => {
  it('logs the saved meal to today, in the meal picked, with an undo', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Log Taco night' }));
    // Its own meal is chosen to start with; she can pick another.
    expect(screen.getByRole('button', { name: 'Dinner', pressed: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lunch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));

    await waitFor(() => expect(addMealToLog).toHaveBeenCalledWith('meal-1', localDateString(), 'lunch'));
    expect(await screen.findByText('Added to lunch ✓ · Taco night')).toBeInTheDocument();

    // The sheet is still closing, so the page under it is aria-hidden a moment.
    fireEvent.click(await screen.findByRole('button', { name: /^undo$/i, hidden: true }));
    await waitFor(() => expect(deleteFoodLog).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Undone ✓')).toBeInTheDocument();
  });

  it('logs to another day when she picks one', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Log Taco night' }));
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-10-14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    await waitFor(() => expect(addMealToLog).toHaveBeenCalledWith('meal-1', '2026-10-14', 'dinner'));
  });

  it('says so in plain words when it fails', async () => {
    addMealToLog.mockRejectedValue(Object.assign(new Error('Request failed with status code 503'), { response: { status: 503 } }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Log Taco night' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log it' }));
    expect(await screen.findByText(/FitnessGeek is restarting/i)).toBeInTheDocument();
  });
});

// UX review L9: on a phone, "Log it" is the full-width button at the bottom.
describe('My Meals: Log this, under the thumb', () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => { window.matchMedia = originalMatchMedia; });

  it('puts "Log it" in the bottom bar on a phone, and only there', async () => {
    window.matchMedia = (query) => ({
      matches: true, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Log Taco night' }));
    const bottom = await screen.findByTestId('thumb-save');
    expect(within(bottom).getByRole('button', { name: 'Log it', hidden: true })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Log it', hidden: true })).toHaveLength(1);
  });
});
