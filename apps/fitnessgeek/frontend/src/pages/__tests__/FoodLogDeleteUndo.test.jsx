/**
 * Deleting a logged food used to be one tap with no confirmation and no way
 * back (FoodLogItem.jsx's delete button/swipe called `onDelete` straight
 * through to the API). Meanwhile *adding* a food always shipped an in-toast
 * Undo (useFoodLogging.js). This pins the fix: deleting now shows a toast
 * with an Undo action, and Undo actually restores the row — by calling the
 * same `logItems()` the search box's own undo calls, not a second "add this
 * back" implementation, with the deleted item's real food_item/servings/
 * nutrition/meal_type, not a stub.
 *
 * A test that only checks "a toast appeared" would pass even if Undo did
 * nothing or restored the wrong food — so this asserts exactly what Undo
 * hands to `logItems`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

const deleteFoodLog = vi.fn();
const logItems = vi.fn();

const OATMEAL_LOG = {
  id: 'log1',
  meal_type: 'breakfast',
  servings: 2,
  nutrition: { calories_per_serving: 220, protein_grams: 6, carbs_grams: 30, fat_grams: 4 },
  food_item: { _id: 'f1', name: 'Oatmeal', nutrition: { calories_per_serving: 200, protein_grams: 5, carbs_grams: 27, fat_grams: 3 } }
};

vi.mock('../../components/FoodSearch', () => ({ UnifiedFoodSearch: () => null }));
vi.mock('../../components/FoodLog/NutritionSummary.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/CalorieSummary.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/SaveMealDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/EditLogDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/CopyMealDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/HouseholdLogView.jsx', () => ({ default: () => null }));
vi.mock('../../components/MyFoods/FoodEditDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog', () => ({
  DateNavigator: ({ calorieCard }) => <div>{calorieCard}</div>,
  AddFoodDialog: () => null
}));

// A thin stand-in that exposes exactly one delete button per log — real
// FoodLogItem/swipe behaviour is a separate concern from what happens once
// `onDeleteLog` fires, which is what this test is about.
vi.mock('../../components/FoodLog/MealSection.jsx', () => ({
  default: ({ mealType, logs, onDeleteLog }) => (
    <div>
      {logs.map((log) => (
        <button key={log.id} onClick={() => onDeleteLog(log.id)}>
          Delete {log.food_item.name} ({mealType})
        </button>
      ))}
    </div>
  )
}));

vi.mock('../../hooks/useFoodLog.js', () => ({
  useFoodLog: () => ({
    logs: [OATMEAL_LOG],
    loading: false,
    successMessage: null,
    errorMessage: null,
    nutritionSummary: {},
    refreshGoals: vi.fn(),
    refreshLogs: vi.fn(),
    getLogsByMealType: (mealType) => [OATMEAL_LOG].filter((l) => l.meal_type === mealType),
    updateFoodLog: vi.fn(),
    deleteFoodLog,
    saveMeal: vi.fn(),
    favoriteFoodIds: new Set(),
    toggleFavoriteId: vi.fn(),
    showError: vi.fn(),
    clearSuccessMessage: vi.fn(),
    clearErrorMessage: vi.fn()
  })
}));

vi.mock('../../hooks/useFoodLogging.js', () => ({
  useFoodLogging: () => ({
    logItems,
    undoLogs: vi.fn(),
    describeMeal: vi.fn(),
    adjustLogCalories: vi.fn(),
    createFood: vi.fn()
  })
}));

vi.mock('../../services/settingsService.js', () => ({
  settingsService: {
    getSettings: vi.fn().mockResolvedValue({ data: {} }),
    updateSettings: vi.fn().mockResolvedValue({})
  }
}));

vi.mock('../../services/goalsService.js', () => ({
  goalsService: { getDerivedMacros: vi.fn().mockResolvedValue({ data: {} }) }
}));

const { default: FoodLog } = await import('../FoodLog.jsx');

beforeEach(() => {
  deleteFoodLog.mockResolvedValue(true);
  logItems.mockResolvedValue({ ok: 1, fail: 0, logIds: ['log2'], perItem: [['log2']] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('deleting offers an undo that actually restores the row', () => {
  it('shows a toast with Undo, and Undo re-logs the exact item that was removed', async () => {
    render(
      <GeekToastProvider>
        <FoodLog />
      </GeekToastProvider>
    );

    fireEvent.click(screen.getByText('Delete Oatmeal (breakfast)'));

    await waitFor(() => expect(deleteFoodLog).toHaveBeenCalledWith('log1'));

    // The toast, not a bottom-of-page Alert — consistent with add's feedback.
    const undoButton = await screen.findByRole('button', { name: /undo/i });
    expect(await screen.findByText(/Deleted Oatmeal/i)).toBeInTheDocument();

    fireEvent.click(undoButton);

    await waitFor(() => expect(logItems).toHaveBeenCalledTimes(1));
    // The row Undo hands back has to be the one that was actually removed —
    // same food_item (with its id, so it's the same catalog food), the same
    // servings and the same nutrition SNAPSHOT (not the food's base
    // nutrition), logged back to the same meal.
    expect(logItems).toHaveBeenCalledWith(
      [expect.objectContaining({
        _id: 'f1',
        name: 'Oatmeal',
        servings: 2,
        nutrition: OATMEAL_LOG.nutrition
      })],
      'breakfast'
    );
  });

  it('does not offer an undo when the delete itself failed', async () => {
    deleteFoodLog.mockResolvedValue(false);

    render(
      <GeekToastProvider>
        <FoodLog />
      </GeekToastProvider>
    );

    fireEvent.click(screen.getByText('Delete Oatmeal (breakfast)'));

    await screen.findByText(/could not delete/i);
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    expect(logItems).not.toHaveBeenCalled();
  });
});
