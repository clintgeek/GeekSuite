/**
 * The Simple Food Log (UX review L15, IA-6, L3, L22).
 *
 * It was the Full page: macro shorthand on every row, star/pencil/trash
 * icons, an unlabelled floppy disk, emoji titles, "Deleted X", "No foods
 * logged yet", and a Copy Meal link that copied the whole day. Now in Simple:
 *   - a row is the name, the amount and "190 cal", and a tap opens Edit;
 *   - Remove is inside Edit, and says "Removed X" with Undo;
 *   - the meal header keeps only "+ Add"; no "Save as a meal";
 *   - no "Copy a meal from another day" link.
 * Full keeps its rows, with "Save as a meal" spelled out. Both lose the
 * emoji and say "Nothing yet". On a backfilled day the inline add box names
 * the day ("Add to Thursday's dinner (yesterday)").
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';
import { MemoryRouter } from 'react-router-dom';
import { ExperienceContext } from '../../contexts/ExperienceContext.jsx';

vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useGeekPrimaryAction: () => {},
}));

const deleteFoodLog = vi.fn();
const logItems = vi.fn();

const EGGS = {
  id: 'log-eggs',
  meal_type: 'breakfast',
  servings: 2,
  log_date: '2026-10-16',
  nutrition: { calories_per_serving: 78, protein_grams: 6, carbs_grams: 1, fat_grams: 5 },
  food_item_id: { id: 'f-egg', name: 'Egg' }
};
const YOGURT = {
  id: 'log-yogurt',
  meal_type: 'breakfast',
  servings: 1,
  log_date: '2026-10-16',
  nutrition: { calories_per_serving: 190, protein_grams: 18, carbs_grams: 8, fat_grams: 10 },
  food_item_id: { id: 'f-yog', name: 'Greek yogurt' }
};
const LOGS = [EGGS, YOGURT];

vi.mock('../../components/FoodSearch', () => ({ FoodComposer: () => <div data-testid="composer" /> }));
vi.mock('../../components/FoodLog/NutritionSummary.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/CalorieSummary.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/CopyMealDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/HouseholdLogView.jsx', () => ({ default: () => null }));
vi.mock('../../components/MyFoods/FoodEditDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog', () => ({
  DateNavigator: ({ calorieCard }) => <div>{calorieCard}</div>,
  AddFoodDialog: () => null
}));

vi.mock('../../hooks/useFoodLog.js', () => ({
  useFoodLog: () => ({
    logs: LOGS,
    loading: false,
    loadProblem: null,
    successMessage: null,
    errorMessage: null,
    nutritionSummary: {},
    refreshGoals: vi.fn(),
    refreshLogs: vi.fn(),
    getLogsByMealType: (mealType) => LOGS.filter((l) => l.meal_type === mealType),
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
  useFoodLogging: () => ({ logItems, undoLogs: vi.fn(), describeMeal: vi.fn(), adjustLogCalories: vi.fn(), createFood: vi.fn() })
}));
vi.mock('../../services/settingsService.js', () => ({
  settingsService: { getSettings: vi.fn().mockResolvedValue({ data: {} }), updateSettings: vi.fn() }
}));
vi.mock('../../services/goalsService.js', () => ({
  goalsService: { getDerivedMacros: vi.fn().mockResolvedValue({ data: {} }) }
}));

const { default: FoodLog } = await import('../FoodLog.jsx');

const renderPage = ({ simple, url = '/food-log' }) => render(
  <ExperienceContext.Provider value={{ loading: false, isSimple: simple, effectiveMode: simple ? 'simple' : 'full' }}>
    <GeekToastProvider>
      <MemoryRouter initialEntries={[url]}><FoodLog /></MemoryRouter>
    </GeekToastProvider>
  </ExperienceContext.Provider>
);

beforeEach(() => {
  // Friday Oct 16 2026, 7pm: the inline box's meal is dinner.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 16, 19, 0));
  deleteFoodLog.mockResolvedValue(true);
  logItems.mockResolvedValue({ ok: 1, fail: 0, logIds: ['log-new'], perItem: [['log-new']] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('Simple Food Log rows', () => {
  it('a row is the name, the amount and the calories — no macros, no star, pencil or trash', () => {
    renderPage({ simple: true });
    const egg = screen.getByRole('button', { name: /^Edit Egg/ });
    expect(egg).toHaveTextContent('Egg×2');
    expect(egg).toHaveTextContent('156 cal');
    const yogurt = screen.getByRole('button', { name: /^Edit Greek yogurt/ });
    expect(yogurt).toHaveTextContent('190 cal');
    expect(yogurt).not.toHaveTextContent('×');

    expect(screen.queryByText(/18P/)).toBeNull();
    expect(screen.queryByText(/P: 18g/)).toBeNull();
    expect(screen.queryByText(/P 18 · C 8 · F 10 g/)).toBeNull();
    expect(screen.queryByRole('button', { name: /favorites/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^remove$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
  });

  it('a tap on the row opens Edit, and Remove there says "Removed Egg" with an Undo that works', async () => {
    renderPage({ simple: true });
    fireEvent.click(screen.getByRole('button', { name: /^Edit Egg/ }));
    const remove = await screen.findByRole('button', { name: 'Remove Egg' });
    fireEvent.click(remove);

    await waitFor(() => expect(deleteFoodLog).toHaveBeenCalledWith('log-eggs'));
    expect(await screen.findByText('Removed Egg')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }));
    await waitFor(() => expect(logItems).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'Egg', servings: 2 })],
      'breakfast'
    ));
  });

  it('the meal header keeps only "+ Add" — no "Save as a meal"', () => {
    renderPage({ simple: true });
    const section = document.getElementById('meal-section-breakfast');
    expect(within(section).getByRole('button', { name: 'Add to breakfast' })).toHaveTextContent('Add');
    expect(within(section).queryByRole('button', { name: /save .* as a meal/i })).toBeNull();
  });

  it('has no "Copy a meal from another day" link', () => {
    renderPage({ simple: true });
    expect(screen.queryByRole('button', { name: /copy a meal/i })).toBeNull();
  });
});

describe('Full Food Log', () => {
  it('keeps the row actions, says Remove, and spells out "Save as a meal"', () => {
    renderPage({ simple: false });
    expect(screen.getAllByRole('button', { name: /^remove$/i }).length).toBeGreaterThan(0);
    const section = document.getElementById('meal-section-breakfast');
    expect(within(section).getByRole('button', { name: 'Save breakfast as a meal' })).toHaveTextContent('Save as a meal');
    expect(screen.getByRole('button', { name: /copy a meal from another day/i })).toBeInTheDocument();
  });

  it('a row writes protein, carbs and fat one way: "P 18 · C 8 · F 10 g" (review U-4)', () => {
    renderPage({ simple: false });
    expect(screen.getAllByText('P 18 · C 8 · F 10 g').length).toBeGreaterThan(0);
    expect(screen.queryByText(/18P|P: 18g/)).toBeNull();
  });
});

describe('Both modes', () => {
  it('meal titles have no emoji, and an empty meal says "Nothing yet"', () => {
    renderPage({ simple: true });
    expect(screen.queryByText(/🌅|☀️|🌙|🍎/u)).toBeNull();
    const dinner = document.getElementById('meal-section-dinner');
    expect(within(dinner).getByText('Dinner')).toBeInTheDocument();
    expect(within(dinner).getByText('Nothing yet')).toBeInTheDocument();
    expect(screen.queryByText('No foods logged yet')).toBeNull();
  });

  it('on yesterday, the inline add box names the day the way the sheet does', () => {
    renderPage({ simple: true, url: '/food-log?date=2026-10-15' });
    expect(screen.getByTestId('inline-add-day')).toHaveTextContent('Add to Thursday’s dinner (yesterday)');
  });

  it('on today, the inline add box adds no day line', () => {
    renderPage({ simple: true });
    expect(screen.queryByTestId('inline-add-day')).toBeNull();
  });
});
