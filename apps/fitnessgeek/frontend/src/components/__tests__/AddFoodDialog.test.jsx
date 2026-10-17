/**
 * The Add Food dialog folds "Your foods" too.
 *
 * The fold shipped on 2026-09-22 reached the inline search on the Food Log
 * page only. On a phone the add flow is this dialog — the thumb-zone "Log
 * food" button and every meal's "+" open it — so the list was still unfolded
 * exactly where it was reported.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

const suggest = vi.fn();
vi.mock('../../services/foodService', () => ({
  foodService: { suggest: (...a) => suggest(...a), search: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../BarcodeScanner/BarcodeScanner.jsx', () => ({ default: () => null }));
vi.mock('../../hooks/useRecentLogs.js', () => ({ useRecentLogs: () => ({ logs: [], meals: [], loading: false }) }));
vi.mock('../FoodSearch/useHouseholdMeals.js', () => ({ useHouseholdMeals: () => [] }));
// Wednesday.
vi.mock('../../hooks/useToday.js', () => ({ useToday: () => '2026-10-14' }));

const { default: AddFoodDialog } = await import('../FoodLog/AddFoodDialog.jsx');
const { forgetDrafts } = await import('../FoodSearch/composerDraft.js');

const food = (name) => ({
  id: name, name, source: 'custom',
  nutrition: { calories_per_serving: 200, protein_grams: 6, carbs_grams: 30, fat_grams: 8 },
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  suggest.mockResolvedValue([food('Homemade quesadilla'), food('Greek yogurt')]);
  forgetDrafts();
});
afterEach(() => vi.useRealTimers());

describe('AddFoodDialog', () => {
  it('opens with "Your foods" folded behind its heading', async () => {
    render(
      <GeekToastProvider>
        <AddFoodDialog open onClose={vi.fn()} mealType="lunch" onLogItems={vi.fn()} />
      </GeekToastProvider>
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(await screen.findByText('Your foods')).toBeInTheDocument();
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
    expect(screen.queryByText('Homemade quesadilla')).not.toBeInTheDocument();
  });

  /**
   * Phase 1.5: she backfills (§2a); the sheet never said which day it wrote to.
   * L22: on a backfilled day the sheet names days by weekday, and the title
   * says which weekday yesterday was.
   */
  it.each([
    ['2026-10-14', 'Add to dinner'],
    ['2026-10-13', "Add to Tuesday’s dinner (yesterday)"],
    ['2026-10-12', "Add to Monday’s dinner"],
    ['2026-10-03', 'Add to dinner on Oct 3'],
  ])('on %s the title says %j', async (date, title) => {
    render(
      <GeekToastProvider>
        <AddFoodDialog open onClose={vi.fn()} mealType="dinner" date={date} onLogItems={vi.fn()} />
      </GeekToastProvider>
    );
    expect(await screen.findByText(title)).toBeInTheDocument();
  });

  it('is the composer: "Tell me what you ate" and Log it', async () => {
    render(
      <GeekToastProvider>
        <AddFoodDialog open onClose={vi.fn()} mealType="lunch" onLogItems={vi.fn()} onDescribe={vi.fn()} />
      </GeekToastProvider>
    );
    expect(await screen.findByLabelText('Tell me what you ate')).toHaveFocus();
    expect(screen.getByTestId('log-it')).toHaveTextContent('Log it');
  });

  /** L18: the sheet unmounts on close; her words used to go with it. */
  it('closing the sheet keeps her words for that day and meal; a log clears them', async () => {
    const onDescribe = vi.fn().mockResolvedValue({
      ok: 1, fail: 0, logIds: ['l1'], skipped: [], questions: [], totalCalories: 140,
      logged: [{ logId: 'l1', name: 'Eggs, 2 large', calories: 140, loggedServings: 1, mealType: 'lunch', nutrition: { calories_per_serving: 140 } }],
    });
    const sheet = (open, mealType = 'lunch') => (
      <GeekToastProvider>
        <AddFoodDialog open={open} onClose={vi.fn()} mealType={mealType} onLogItems={vi.fn()} onDescribe={onDescribe} />
      </GeekToastProvider>
    );
    const { rerender } = render(sheet(true));
    fireEvent.change(await screen.findByLabelText('Tell me what you ate'), { target: { value: 'two eggs and toast' } });
    rerender(sheet(false));
    await waitFor(() => expect(screen.queryByLabelText('Tell me what you ate')).toBeNull());

    // Another meal's sheet doesn't get them…
    rerender(sheet(true, 'dinner'));
    expect(await screen.findByLabelText('Tell me what you ate')).toHaveValue('');
    rerender(sheet(false, 'dinner'));
    await waitFor(() => expect(screen.queryByLabelText('Tell me what you ate')).toBeNull());

    // …lunch's does.
    rerender(sheet(true));
    expect(await screen.findByLabelText('Tell me what you ate')).toHaveValue('two eggs and toast');

    // Once it logs, the draft is gone.
    fireEvent.click(screen.getByTestId('log-it'));
    await waitFor(() => expect(onDescribe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText('Tell me what you ate')).toHaveValue(''));
    rerender(sheet(false));
    await waitFor(() => expect(screen.queryByLabelText('Tell me what you ate')).toBeNull());
    rerender(sheet(true));
    expect(await screen.findByLabelText('Tell me what you ate')).toHaveValue('');
  });

  it("offline, it doesn't promise the words are saved when storage can't keep them", async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    try {
      render(
        <GeekToastProvider>
          <AddFoodDialog open onClose={vi.fn()} mealType="lunch" onLogItems={vi.fn()} onDescribe={vi.fn()} />
        </GeekToastProvider>
      );
      expect(await screen.findByText("No signal — I can’t log this yet. Keep this open and tap Log it when you’re back.")).toBeInTheDocument();
      expect(screen.queryByText(/Your words are saved here/)).toBeNull();
    } finally {
      setItem.mockRestore();
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
    }
  });
});
