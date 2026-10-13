// Tapping a meal card on Home opens `/food-log?date=…&meal=…`: the log must
// open on THAT day and bring THAT meal into view. Before 2026-10-13 the card
// was not tappable at all and the log always opened on today.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GeekToastProvider } from '@geeksuite/ui';

const useFoodLog = vi.fn(() => ({
  logs: [], loading: false, successMessage: null, errorMessage: null, nutritionSummary: {},
  refreshGoals: vi.fn(), refreshLogs: vi.fn(), getLogsByMealType: () => [], updateFoodLog: vi.fn(),
  deleteFoodLog: vi.fn(), saveMeal: vi.fn(), favoriteFoodIds: new Set(), toggleFavoriteId: vi.fn(),
  showError: vi.fn(), clearSuccessMessage: vi.fn(), clearErrorMessage: vi.fn(),
}));
vi.mock('../../hooks/useFoodLog.js', () => ({ useFoodLog: (...a) => useFoodLog(...a) }));
vi.mock('../../hooks/useFoodLogging.js', () => ({
  useFoodLogging: () => ({ logItems: vi.fn(), undoLogs: vi.fn(), describeMeal: vi.fn(), adjustLogCalories: vi.fn(), createFood: vi.fn() }),
}));
vi.mock('../../components/FoodSearch', () => ({ UnifiedFoodSearch: () => null }));
vi.mock('../../components/FoodLog/NutritionSummary.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/CalorieSummary.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/MealSection.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/SaveMealDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/EditLogDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/CopyMealDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/HouseholdLogView.jsx', () => ({ default: () => null }));
vi.mock('../../components/MyFoods/FoodEditDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog', () => ({ AddFoodDialog: () => null, DateNavigator: () => null }));
vi.mock('../../services/settingsService.js', () => ({ settingsService: { getSettings: vi.fn().mockResolvedValue({}) } }));
vi.mock('../../services/goalsService.js', () => ({ goalsService: { getDerivedMacros: vi.fn().mockResolvedValue({}) } }));

const { default: FoodLog } = await import('../FoodLog.jsx');

const renderAt = (url) => render(
  <GeekToastProvider>
    <MemoryRouter initialEntries={[url]}><FoodLog /></MemoryRouter>
  </GeekToastProvider>
);

describe('FoodLog opened from a meal card', () => {
  beforeEach(() => {
    useFoodLog.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
    globalThis.requestAnimationFrame = (cb) => { cb(); return 0; };
  });

  it('opens on the linked day and scrolls to the linked meal', async () => {
    renderAt('/food-log?date=2026-10-01&meal=lunch');

    expect(useFoodLog).toHaveBeenCalledWith('2026-10-01');
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(Element.prototype.scrollIntoView.mock.instances[0].id).toBe('meal-section-lunch');
  });

  it('ignores a malformed date and an unknown meal', () => {
    renderAt('/food-log?date=yesterday&meal=brunchy');

    expect(useFoodLog).not.toHaveBeenCalledWith('yesterday');
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});
