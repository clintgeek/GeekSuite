/**
 * Changing what is logged, on Today (DOCS/ONE_APP_PLAN.md §1.5, and the
 * requirement that nothing the Food log could do is lost):
 *
 *   - a food row opens Edit; Save there writes the entry and says "Saved"
 *     (or where it moved to); Remove there says "Removed X" with an Undo
 *     that re-logs the exact item, in the add's own undo grammar;
 *   - a meal's "more" menu holds Copy from another day and Save as a meal;
 *   - "What your household ate" is a quiet link under the meals, and its
 *     copy lands in the copy dialog already filled in;
 *   - the activity add-back and "Change today's target" are behind "Macros
 *     and details", as is keto's net-carb line.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';
import { MemoryRouter } from 'react-router-dom';
import { foodLog } from './todayHarness.js';

const TODAY = '2026-10-16';
const EGGS = foodLog('log-eggs', 'Egg', 'breakfast', 78, 2);
const YOGURT = foodLog('log-yogurt', 'Greek yogurt', 'breakfast', 190, 1, { nutrition: { protein_grams: 18, carbs_grams: 8, fat_grams: 10 } });
let LOGS = [EGGS, YOGURT];

const logItems = vi.fn();

vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: {
    formatDate: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    getDailySummary: vi.fn(),
    getGarminDaily: vi.fn(() => Promise.resolve(null)),
    getLogsForDate: vi.fn(),
    deleteFoodLog: vi.fn(),
    updateFoodLog: vi.fn(),
    createMeal: vi.fn(),
  },
}));
vi.mock('../../services/goalsService.js', () => ({ goalsService: { getDerivedMacros: vi.fn() } }));
vi.mock('../../services/weightService.js', () => ({
  weightService: { getWeightStats: vi.fn(() => Promise.resolve(null)), getWeightLogs: vi.fn(() => Promise.resolve({ data: [] })) },
}));
vi.mock('../../services/bpService.js', () => ({ bpService: { getBPLogs: vi.fn(() => Promise.resolve({ data: [] })) } }));
vi.mock('../../services/streakService.js', () => ({ streakService: { getLoginStreak: vi.fn(() => Promise.resolve(null)) } }));
vi.mock('../../services/settingsService.js', () => ({
  settingsService: { getSettings: vi.fn(), updateSettings: vi.fn(() => Promise.resolve({})) },
}));
vi.mock('../../services/bodyCompService.js', () => ({ bodyCompService: { getSummary: vi.fn(() => Promise.resolve(null)) } }));
vi.mock('../../services/medsService.js', () => ({
  medsService: { list: vi.fn(() => Promise.resolve([])), getLogsByDate: vi.fn(() => Promise.resolve([])), log: vi.fn() },
}));
vi.mock('../../hooks/useFoodLogging.js', () => ({
  useFoodLogging: () => ({ logItems, undoLogs: vi.fn(), describeMeal: vi.fn(), adjustLogCalories: vi.fn(), createFood: vi.fn() }),
}));
vi.mock('../../hooks/useToday.js', () => ({ useToday: () => '2026-10-16', default: () => '2026-10-16' }));
vi.mock('../../components/Dashboard/AIInsightsCard.jsx', () => ({ default: () => null }));
vi.mock('../../components/FoodLog/AddFoodDialog.jsx', () => ({ default: () => null }));
vi.mock('../../components/MyFoods/FoodEditDialog.jsx', () => ({ default: () => null }));
// The dialogs, reduced to what the page hands them (their own tests cover
// what they do with it). EditLogDialog's props are a fixed contract: open,
// onClose, onSave, onRemove, log, loading.
vi.mock('../../components/FoodLog/EditLogDialog.jsx', () => ({
  default: ({ open, log, onSave, onRemove, onClose, loading }) => (open ? (
    <div role="dialog" aria-label="Edit">
      <span data-testid="editing">{(log.food_item_id || log.food_item).name}</span>
      <span data-testid="edit-busy">{String(loading)}</span>
      <button type="button" onClick={() => onSave(log.id, { servings: 3 })}>Save edit</button>
      <button type="button" onClick={() => onSave(log.id, { servings: 3, log_date: '2026-10-15' })}>Move to yesterday</button>
      <button type="button" onClick={() => onRemove(log.id)}>Remove it</button>
      <button type="button" onClick={onClose}>Close edit</button>
    </div>
  ) : null),
}));
vi.mock('../../components/FoodLog/SaveMealDialog.jsx', () => ({
  default: ({ open, mealType, logs, onSave, onClose }) => (open ? (
    <div role="dialog" aria-label="Save meal">
      <span data-testid="saving-meal">{`${mealType}:${logs.map((l) => l.id).join(',')}`}</span>
      <button type="button" onClick={() => onSave({ name: 'Usual breakfast', meal_type: mealType })}>Save meal</button>
      <button type="button" onClick={onClose}>Close save</button>
    </div>
  ) : null),
}));
vi.mock('../../components/FoodLog/CopyMealDialog.jsx', () => ({
  default: ({ open, currentDate, prefill, onCopyComplete, onClose }) => (open ? (
    <div role="dialog" aria-label="Copy">
      <span data-testid="copy-props">{JSON.stringify({ currentDate, prefill })}</span>
      <button type="button" onClick={() => onCopyComplete(currentDate)}>Copied here</button>
      <button type="button" onClick={() => onCopyComplete('2026-10-20')}>Copied elsewhere</button>
      <button type="button" onClick={onClose}>Close copy</button>
    </div>
  ) : null),
}));
vi.mock('../../components/FoodLog/HouseholdLogView.jsx', () => ({
  default: ({ open, currentDate, onCopyMeal }) => (open ? (
    <div role="dialog" aria-label="Household">
      <span data-testid="household-day">{currentDate}</span>
      <button type="button" onClick={() => onCopyMeal({ fromDate: currentDate, fromMealType: 'dinner', fromUserId: 'u-heather', memberName: 'Heather' })}>Copy Heather’s dinner</button>
    </div>
  ) : null),
}));

const { fitnessGeekService } = await import('../../services/fitnessGeekService.js');
const { goalsService } = await import('../../services/goalsService.js');
const { settingsService } = await import('../../services/settingsService.js');
const { default: Today } = await import('../Today.jsx');

const renderPage = () => render(
  <GeekToastProvider>
    <MemoryRouter initialEntries={['/dashboard']}><Today /></MemoryRouter>
  </GeekToastProvider>
);
const openDetails = async () => fireEvent.click(await screen.findByTestId('macros-details-toggle'));
const openEdit = async (name) => {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^Edit ${name}`) }));
  return screen.findByRole('dialog', { name: 'Edit' });
};

beforeEach(() => {
  LOGS = [EGGS, YOGURT];
  try { window.localStorage.clear(); } catch { /* jsdom */ }
  fitnessGeekService.getLogsForDate.mockImplementation(() => Promise.resolve({ success: true, data: LOGS }));
  fitnessGeekService.getDailySummary.mockImplementation(() => Promise.resolve({ data: { totals: { calories: 346, net_carbs_grams: 12 }, calorieGoal: 2000, meals: {} } }));
  fitnessGeekService.deleteFoodLog.mockResolvedValue({ success: true });
  fitnessGeekService.updateFoodLog.mockResolvedValue({ success: true });
  fitnessGeekService.createMeal.mockResolvedValue({ success: true });
  goalsService.getDerivedMacros.mockResolvedValue({ data: { today: { target_calories: 2000, base_calories: 1760, activity_add_kcal: 240 } } });
  settingsService.getSettings.mockResolvedValue({ data: {} });
  logItems.mockResolvedValue({ ok: 1, fail: 0, logIds: ['log-new'], perItem: [['log-new']] });
});
afterEach(() => { vi.clearAllMocks(); });

describe('a food row', () => {
  it('is the name, the amount and the calories — no macros, star, pencil or trash', async () => {
    renderPage();
    const egg = await screen.findByRole('button', { name: 'Edit Egg, ×2, 156 cal' });
    expect(egg).toHaveTextContent('156 cal');
    const yogurt = screen.getByRole('button', { name: 'Edit Greek yogurt, 190 cal' });
    expect(yogurt).not.toHaveTextContent('×');
    expect(screen.queryByText(/P 18 · C 8 · F 10 g/)).toBeNull();
    expect(screen.queryByRole('button', { name: /favorites/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^remove$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    expect(screen.getByTestId('meal-total-breakfast')).toHaveTextContent('346 cal');
  });

  it('meal titles have no emoji, and an empty meal says "Nothing yet"', async () => {
    renderPage();
    const dinner = await screen.findByTestId('meal-card-dinner');
    expect(screen.queryByText(/🌅|☀️|🌙|🍎/u)).toBeNull();
    expect(within(dinner).getByRole('heading', { name: 'Dinner' })).toBeInTheDocument();
    expect(within(dinner).getByText('Nothing yet')).toBeInTheDocument();
    expect(screen.queryByText('No foods logged yet')).toBeNull();
  });

  it('a tap opens Edit on that entry', async () => {
    renderPage();
    const dialog = await openEdit('Egg');
    expect(within(dialog).getByTestId('editing')).toHaveTextContent('Egg');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close edit' }));
    expect(screen.queryByRole('dialog', { name: 'Edit' })).toBeNull();
  });
});

describe('saving an edit', () => {
  it('writes the entry, closes Edit, re-reads the day\'s food and says Saved', async () => {
    renderPage();
    const dialog = await openEdit('Egg');
    fitnessGeekService.getLogsForDate.mockClear();
    fitnessGeekService.getDailySummary.mockClear();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save edit' }));
    await waitFor(() => expect(fitnessGeekService.updateFoodLog).toHaveBeenCalledWith('log-eggs', { servings: 3 }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Edit' })).toBeNull();
    expect(fitnessGeekService.getLogsForDate).toHaveBeenCalledWith(TODAY);
    expect(fitnessGeekService.getDailySummary).toHaveBeenCalledWith(TODAY);
  });

  it('a moved entry leaves this day, so the toast says where it went', async () => {
    renderPage();
    const dialog = await openEdit('Egg');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to yesterday' }));
    expect(await screen.findByText('Moved to yesterday')).toBeInTheDocument();
  });

  it('a save that fails says so and leaves Edit open', async () => {
    fitnessGeekService.updateFoodLog.mockRejectedValue(new Error('nope'));
    renderPage();
    const dialog = await openEdit('Egg');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save edit' }));
    expect(await screen.findByText(/Couldn’t save that/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByText('Saved')).toBeNull();
  });
});

describe('removing offers an undo that actually restores the row', () => {
  const remove = async () => {
    const dialog = await openEdit('Egg');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove it' }));
  };

  it('Remove in Edit says "Removed Egg", and Undo re-logs the exact item that was removed', async () => {
    renderPage();
    await remove();
    await waitFor(() => expect(fitnessGeekService.deleteFoodLog).toHaveBeenCalledWith('log-eggs'));
    expect(screen.queryByRole('dialog', { name: 'Edit' })).toBeNull();

    // A toast, not an alert at the foot of the page — like an add's.
    expect(await screen.findByText('Removed Egg')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /^undo$/i }));

    await waitFor(() => expect(logItems).toHaveBeenCalledTimes(1));
    // The row Undo hands back is the one that was removed: the same food
    // (with its id), the same servings and the same nutrition SNAPSHOT (not
    // the food's base nutrition), logged back to the same meal.
    expect(logItems).toHaveBeenCalledWith(
      [expect.objectContaining({ _id: 'f-log-eggs', name: 'Egg', servings: 2, nutrition: EGGS.nutrition })],
      'breakfast'
    );
  });

  it('re-reads only the day\'s food after a remove', async () => {
    renderPage();
    await screen.findByRole('button', { name: /^Edit Egg/ });
    fitnessGeekService.getLogsForDate.mockClear();
    fitnessGeekService.getGarminDaily.mockClear();
    goalsService.getDerivedMacros.mockClear();
    LOGS = [YOGURT];
    await remove();
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Edit Egg/ })).toBeNull());
    expect(fitnessGeekService.getLogsForDate).toHaveBeenCalledTimes(1);
    expect(fitnessGeekService.getGarminDaily).not.toHaveBeenCalled();
    expect(goalsService.getDerivedMacros).not.toHaveBeenCalled();
  });

  it.each([
    ['the request fails', () => fitnessGeekService.deleteFoodLog.mockRejectedValue(new Error('down'))],
    ['the server says no', () => fitnessGeekService.deleteFoodLog.mockResolvedValue({ success: false })],
  ])('does not offer an undo when the remove itself failed (%s)', async (_why, arrange) => {
    arrange();
    renderPage();
    await remove();
    await screen.findByText(/couldn.t remove that/i);
    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull();
    expect(screen.queryByText('Removed Egg')).toBeNull();
    expect(logItems).not.toHaveBeenCalled();
    // The row is still there.
    expect(screen.getByRole('button', { name: /^Edit Egg/ })).toBeInTheDocument();
  });

  it('speaks the same undo grammar as an add: "Undone ✓", ten seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderPage();
      await remove();
      await screen.findByText('Removed Egg');
      // Still there after six seconds (it used to be four).
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      fireEvent.click(screen.getByRole('button', { name: /^undo$/i }));
      expect(await screen.findByText('Undone ✓')).toBeInTheDocument();
      expect(screen.queryByText('Removed Egg')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed undo says so and offers Try again', async () => {
    logItems
      .mockResolvedValueOnce({ ok: 0, fail: 1, logIds: [], perItem: [[]] })
      .mockResolvedValueOnce({ ok: 1, fail: 0, logIds: ['log3'], perItem: [['log3']] });
    renderPage();
    await remove();
    fireEvent.click(await screen.findByRole('button', { name: /^undo$/i }));
    expect(await screen.findByText('Couldn’t undo — try again')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Undone ✓')).toBeInTheDocument();
    expect(logItems).toHaveBeenCalledTimes(2);
  });
});

describe('a meal\'s "more" menu', () => {
  it('Save as a meal hands that meal\'s entries to the save dialog, and saving says "Meal saved"', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'More for breakfast' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as a meal' }));
    expect(await screen.findByTestId('saving-meal')).toHaveTextContent('breakfast:log-eggs,log-yogurt');
    fireEvent.click(screen.getByRole('button', { name: 'Save meal' }));
    await waitFor(() => expect(fitnessGeekService.createMeal).toHaveBeenCalledWith({ name: 'Usual breakfast', meal_type: 'breakfast' }));
    expect(await screen.findByText('Meal saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save meal' })).toBeNull());
  });

  it('a meal that would not save says so and keeps the dialog', async () => {
    fitnessGeekService.createMeal.mockResolvedValue({ success: false });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'More for breakfast' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as a meal' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save meal' }));
    expect(await screen.findByText('Couldn’t save that meal. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Save meal' })).toBeInTheDocument();
  });

  it('Copy from another day opens the copy dialog on this meal, from the day before', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'More for dinner' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy from another day' }));
    const props = JSON.parse((await screen.findByTestId('copy-props')).textContent);
    expect(props).toEqual({
      currentDate: TODAY,
      prefill: { fromDate: '2026-10-15', fromMealType: 'dinner', targetDate: TODAY, toMealType: 'dinner' },
    });
  });

  it('a copy into the day on screen re-reads its food; a copy somewhere else does not', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'More for dinner' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy from another day' }));
    await screen.findByTestId('copy-props');
    fitnessGeekService.getLogsForDate.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Copied elsewhere' }));
    expect(fitnessGeekService.getLogsForDate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copied here' }));
    await waitFor(() => expect(fitnessGeekService.getLogsForDate).toHaveBeenCalledWith(TODAY));
  });
});

describe('the household view', () => {
  it('is a quiet link under the meals, for the day on screen', async () => {
    renderPage();
    const link = await screen.findByTestId('household-link');
    expect(link).toHaveTextContent('What your household ate');
    expect(screen.getByTestId('meal-cards').compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(link);
    expect(await screen.findByTestId('household-day')).toHaveTextContent(TODAY);
  });

  it('copying from it lands in the copy dialog, already filled in', async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId('household-link'));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy Heather’s dinner' }));
    expect(screen.queryByRole('dialog', { name: 'Household' })).toBeNull();
    const props = JSON.parse((await screen.findByTestId('copy-props')).textContent);
    expect(props.prefill).toEqual({ fromDate: TODAY, fromMealType: 'dinner', fromUserId: 'u-heather', memberName: 'Heather' });
  });
});

describe('behind "Macros and details"', () => {
  it('the activity add-back is a sentence, and not on the page until asked for', async () => {
    renderPage();
    await screen.findByTestId('calories-sentence');
    expect(screen.queryByTestId('activity-allowance')).toBeNull();
    await openDetails();
    expect(await screen.findByTestId('activity-allowance')).toHaveTextContent('Includes 240 extra for today’s activity.');
  });

  it('no add-back line when there is none', async () => {
    goalsService.getDerivedMacros.mockResolvedValue({ data: { today: { target_calories: 2000, base_calories: 2000, activity_add_kcal: 0 } } });
    renderPage();
    await openDetails();
    await screen.findByTestId('macro-strip');
    expect(screen.queryByTestId('activity-allowance')).toBeNull();
  });

  it('"Change today\'s target" writes this weekday\'s slot of the plan, never below its floor, and re-reads the target', async () => {
    settingsService.getSettings.mockResolvedValue({ data: { nutrition_goal: { enabled: true, daily_calorie_target: 2000, min_safe_calories: 1500, weekly_schedule: [2000, 2000, 2000, 2000, 2000, 2000, 2000] } } });
    renderPage();
    await openDetails();
    const field = await screen.findByLabelText('Change today’s target');
    expect(field).toHaveValue(2000);
    fireEvent.change(field, { target: { value: '1000' } });
    goalsService.getDerivedMacros.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(settingsService.updateSettings).toHaveBeenCalledTimes(1));
    const sent = settingsService.updateSettings.mock.calls[0][0].nutrition_goal;
    expect(sent.enabled).toBe(true);
    expect(sent.daily_calorie_target).toBe(2000);
    // One slot changed, to the floor (1,500), not the 1,000 typed.
    expect(sent.weekly_schedule.filter((v) => v === 1500)).toHaveLength(1);
    expect(sent.weekly_schedule.filter((v) => v === 2000)).toHaveLength(6);
    expect(await screen.findByText('Today’s target saved')).toBeInTheDocument();
    await waitFor(() => expect(goalsService.getDerivedMacros).toHaveBeenCalled());
  });

  it('keto: fat, protein and the net-carb line against the limit, and a note when a food lists no fiber', async () => {
    settingsService.getSettings.mockResolvedValue({ data: { nutrition_goal: { enabled: true, mode: 'keto', keto: { net_carb_limit_g: 25 } } } });
    renderPage();
    await openDetails();
    const strip = await screen.findByTestId('macro-strip');
    await waitFor(() => expect(within(strip).getByText('Net carbs', { selector: 'b' })).toBeInTheDocument());
    expect(within(strip).getByText('Net carbs', { selector: 'b' }).closest('div')).toHaveTextContent(/12 g of 25.*48%/);
    expect(within(strip).queryByText('Carbs', { selector: 'b' })).toBeNull();
    // The fixtures list carbs and no fiber.
    expect(screen.getByTestId('missing-fiber-note')).toBeInTheDocument();
  });

  it('not keto: no net-carb line and no fiber note', async () => {
    renderPage();
    await openDetails();
    const strip = await screen.findByTestId('macro-strip');
    expect(within(strip).queryByText('Net carbs', { selector: 'b' })).toBeNull();
    expect(screen.queryByTestId('missing-fiber-note')).toBeNull();
  });
});
