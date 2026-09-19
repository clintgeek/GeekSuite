/**
 * FoodLog.jsx's inline search box also hardcoded `useState('snack')` for its
 * meal-type chip, so a tap on a search result there logged breakfast as a
 * snack the same way FoodSearch.jsx's did (see FoodSearch.test.jsx). The FAB
 * already got this right via `mealTypeForNow()` — this pins that the page's
 * own search box agrees with it from the first render, not just the FAB.
 *
 * Everything not under test (dialogs, meal sections, services) is stubbed so
 * this stays a test of the one line that changed, not of the whole page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

vi.mock('../../components/FoodSearch', () => ({
  UnifiedFoodSearch: ({ mealType }) => <div data-testid="meal-type">{mealType}</div>
}));

vi.mock('../../components/FoodLog/NutritionSummary.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/CalorieSummary.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/MealSection.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/SaveMealDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/EditLogDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/CopyMealDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/HouseholdLogView.jsx', () => ({ default: () => null }));
vi.mock('../../components/MyFoods/FoodEditDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog', () => ({
  DateNavigator: ({ calorieCard }) => <div>{calorieCard}</div>,
  AddFoodDialog: () => null
}));

vi.mock('../../hooks/useFoodLog.js', () => ({
  useFoodLog: () => ({
    logs: [],
    loading: false,
    successMessage: null,
    errorMessage: null,
    nutritionSummary: {},
    refreshGoals: vi.fn(),
    refreshLogs: vi.fn(),
    getLogsByMealType: () => [],
    updateFoodLog: vi.fn(),
    deleteFoodLog: vi.fn(),
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
    logItems: vi.fn(),
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

const setHour = (hour) => {
  const now = new Date();
  now.setHours(hour, 0, 0, 0);
  vi.setSystemTime(now);
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('the inline search box defaults to the clock, not a hardcoded snack', () => {
  it('defaults to breakfast before 10am', () => {
    setHour(8);
    render(
      <GeekToastProvider>
        <FoodLog />
      </GeekToastProvider>
    );
    expect(screen.getByTestId('meal-type').textContent).toBe('breakfast');
  });

  it('defaults to dinner in the evening, not snack', () => {
    setHour(18);
    render(
      <GeekToastProvider>
        <FoodLog />
      </GeekToastProvider>
    );
    expect(screen.getByTestId('meal-type').textContent).toBe('dinner');
  });
});
