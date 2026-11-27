/**
 * Saved foods > Meals must survive bad data and a failed read.
 *
 * One `null` in the list (or a meal with no name, no foods, or a food with no
 * nutrition) used to throw in the filter and take the page to the error
 * boundary. And a read that failed drew "No meals saved yet", which is a lie.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

const getMeals = vi.fn();
vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: {
    getMeals: (...a) => getMeals(...a),
    addMealToLog: vi.fn(),
    deleteFoodLog: vi.fn(),
    deleteMeal: vi.fn(),
    updateMeal: vi.fn()
  }
}));
vi.mock('../../services/foodService.js', () => ({ foodService: { describe: vi.fn(), create: vi.fn() } }));
vi.mock('../../hooks/useRecentLogs.js', () => ({ forgetRecentLogs: vi.fn() }));

const { default: MyMeals } = await import('../MyMeals.jsx');
const renderPage = () => render(<GeekToastProvider><MyMeals embedded /></GeekToastProvider>);

beforeEach(() => vi.clearAllMocks());

describe('My meals: bad records', () => {
  it('draws the good rows when the list holds a null and partial meals', async () => {
    getMeals.mockResolvedValue([
      null,
      { id: 'm1', name: 'Usual breakfast', meal_type: 'breakfast', food_items: [
        { servings: 2, food_item_id: { id: 'f1', name: 'Egg', nutrition: { calories_per_serving: 78 } } },
        null,
        { servings: 1, food_item_id: null },
        { servings: 1, food_item_id: { id: 'f2', name: 'Deleted food' } },
      ] },
      { id: 'm2' },
      { id: 'm3', name: null, food_items: null },
    ]);
    renderPage();
    expect(await screen.findByText('Usual breakfast')).toBeInTheDocument();
    // 2 × 78, and the entries with no food or no nutrition count for nothing.
    expect(screen.getByText('Breakfast · 3 foods · 156 cal')).toBeInTheDocument();
    expect(screen.getAllByText('Untitled meal')).toHaveLength(2);
    expect(screen.getAllByTestId('saved-meal-row')).toHaveLength(3);
    // Typing in the search must not throw on the nameless ones either.
    fireEvent.change(screen.getByLabelText('Search meals'), { target: { value: 'usual' } });
    expect(screen.getAllByTestId('saved-meal-row')).toHaveLength(1);
    expect(screen.getByText('1 of 3 meals')).toBeInTheDocument();
  });
});

describe('My meals: the states of the read', () => {
  it('a failed read says so and offers Try again; it is not "No meals saved yet"', async () => {
    getMeals.mockRejectedValueOnce(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Couldn’t load your meals')).toBeInTheDocument();
    expect(screen.queryByText('No meals saved yet')).toBeNull();

    getMeals.mockResolvedValue([{ id: 'm1', name: 'Taco night', food_items: [] }]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Taco night')).toBeInTheDocument();
    expect(screen.queryByText('Couldn’t load your meals')).toBeNull();
  });

  it('empty says where saving a meal lives now (Today), not "the Food log"', async () => {
    getMeals.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No meals saved yet')).toBeInTheDocument();
    expect(screen.getByText(/On Today, tap the ⋯ beside a meal and choose “Save as a meal”/)).toBeInTheDocument();
    expect(screen.queryByText(/food log/i)).toBeNull();
    // Nothing to search yet, so no search box.
    expect(screen.queryByLabelText('Search meals')).toBeNull();
  });

  it('has no card title repeating the tab, and the count sits with the list', async () => {
    getMeals.mockResolvedValue([{ id: 'm1', name: 'Taco night', food_items: [] }]);
    renderPage();
    expect(await screen.findByText('1 meal')).toBeInTheDocument();
    expect(screen.queryByText('My meals')).toBeNull();
  });
});

/**
 * Review 2026-11-27: delete confirmations used a filled red button. A
 * destructive confirm is text in the error colour, like Remove in Edit entry.
 */
describe('My meals: deleting', () => {
  it('the confirm is text in the error colour, never a filled red button, and still deletes', async () => {
    const { fitnessGeekService } = await import('../../services/fitnessGeekService.js');
    fitnessGeekService.deleteMeal.mockResolvedValue({});
    getMeals.mockResolvedValue([{ id: 'm1', name: 'Taco night', food_items: [] }]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Taco night' }));
    expect(await screen.findByText('Delete this meal?')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm.className).toMatch(/MuiButton-textError/);
    expect(confirm.className).not.toMatch(/MuiButton-contained/);
    fireEvent.click(confirm);
    expect(fitnessGeekService.deleteMeal).toHaveBeenCalledWith('m1');
  });
});
