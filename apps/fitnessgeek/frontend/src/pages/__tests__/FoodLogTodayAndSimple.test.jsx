/**
 * Two Food Log page fixes from REVIEW_2026-10:
 *
 *   B3 — the date was fixed at mount. An installed PWA kept alive overnight
 *        was still on yesterday at breakfast, and adds went there. Now a page
 *        showing "today" follows today; a day picked on purpose stays put.
 *   Phase 1.6 — Simple hides the calorie gear ("Adjust today" could change
 *        her goal), the "Includes N extra for today's activity" line and the
 *        floating Log food button. Full is unchanged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';
import { MemoryRouter } from 'react-router-dom';
import { ExperienceContext } from '../../contexts/ExperienceContext.jsx';

const primaryAction = vi.fn();
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useGeekPrimaryAction: (config) => primaryAction(config)
}));

const seenDates = [];
vi.mock('../../components/FoodSearch', () => ({ UnifiedFoodSearch: () => null }));
vi.mock('../../components/FoodLog/NutritionSummary.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/MealSection.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/SaveMealDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/EditLogDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/CopyMealDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/HouseholdLogView.jsx', () => ({ default: () => null }));
vi.mock('../../components/MyFoods/FoodEditDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog', () => ({
  DateNavigator: ({ selectedDate, calorieCard }) => (
    <div>
      <div data-testid="date">{selectedDate}</div>
      {calorieCard}
    </div>
  ),
  AddFoodDialog: () => null
}));
vi.mock('../../hooks/useFoodLog.js', () => ({
  useFoodLog: (date) => {
    seenDates.push(date);
    return {
      logs: [],
      loading: false,
      loadProblem: null,
      successMessage: null,
      errorMessage: null,
      nutritionSummary: { calories: 500, calorieGoal: 2240 },
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
    };
  }
}));
vi.mock('../../hooks/useFoodLogging.js', () => ({
  useFoodLogging: () => ({ logItems: vi.fn(), undoLogs: vi.fn(), describeMeal: vi.fn(), adjustLogCalories: vi.fn(), createFood: vi.fn() })
}));
vi.mock('../../services/settingsService.js', () => ({
  settingsService: { getSettings: vi.fn().mockResolvedValue({ data: {} }), updateSettings: vi.fn() }
}));
vi.mock('../../services/goalsService.js', () => ({
  goalsService: { getDerivedMacros: vi.fn().mockResolvedValue({ data: { today: { base_calories: 2000, activity_add_kcal: 240 } } }) }
}));

const { default: FoodLog } = await import('../FoodLog.jsx');

const renderPage = ({ simple = false, url = '/food' } = {}) => render(
  <ExperienceContext.Provider value={{ loading: false, isSimple: simple, effectiveMode: simple ? 'simple' : 'full' }}>
    <GeekToastProvider>
      <MemoryRouter initialEntries={[url]}><FoodLog /></MemoryRouter>
    </GeekToastProvider>
  </ExperienceContext.Provider>
);

const comeBackAt = async (iso) => {
  vi.setSystemTime(new Date(iso));
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
};

beforeEach(() => {
  seenDates.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('B3: the day on screen follows today', () => {
  it('moves to the new day when the app is resumed next morning', async () => {
    vi.setSystemTime(new Date(2026, 9, 15, 22, 0));
    renderPage();
    expect(screen.getByTestId('date').textContent).toBe('2026-10-15');

    await comeBackAt(new Date(2026, 9, 16, 7, 30));
    expect(screen.getByTestId('date').textContent).toBe('2026-10-16');
    expect(seenDates[seenDates.length - 1]).toBe('2026-10-16');
  });

  it('leaves a day she chose on purpose alone', async () => {
    vi.setSystemTime(new Date(2026, 9, 15, 22, 0));
    renderPage({ url: '/food?date=2026-10-14' });
    expect(screen.getByTestId('date').textContent).toBe('2026-10-14');

    await comeBackAt(new Date(2026, 9, 16, 7, 30));
    expect(screen.getByTestId('date').textContent).toBe('2026-10-14');
  });
});

describe('Phase 1.6: Simple keeps the Log page to the point', () => {
  it('Simple hides the calorie gear, the activity line and the floating button', async () => {
    renderPage({ simple: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.queryByLabelText('calorie-goal-settings')).toBeNull();
    expect(screen.queryByTestId('activity-allowance')).toBeNull();
    expect(primaryAction).toHaveBeenCalledWith(expect.objectContaining({ hidden: true }));
  });

  it('Full keeps all three', async () => {
    renderPage({ simple: false });
    expect(await screen.findByTestId('activity-allowance')).toBeInTheDocument();
    expect(screen.getByLabelText('calorie-goal-settings')).toBeInTheDocument();
    expect(primaryAction).not.toHaveBeenCalledWith(expect.objectContaining({ hidden: true }));
  });
});
