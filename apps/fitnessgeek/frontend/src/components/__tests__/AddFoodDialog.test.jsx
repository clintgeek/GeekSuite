/**
 * The Add Food dialog folds "Your foods" too.
 *
 * The fold shipped on 2026-09-22 reached the inline search on the Food Log
 * page only. On a phone the add flow is this dialog — the thumb-zone "Log
 * food" button and every meal's "+" open it — so the list was still unfolded
 * exactly where it was reported.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

const suggest = vi.fn();
vi.mock('../../services/foodService', () => ({
  foodService: { suggest: (...a) => suggest(...a), search: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../BarcodeScanner/BarcodeScanner.jsx', () => ({ default: () => null }));
vi.mock('../../hooks/useRecentLogs.js', () => ({ useRecentLogs: () => ({ logs: [], meals: [], loading: false }) }));
// Wednesday.
vi.mock('../../hooks/useToday.js', () => ({ useToday: () => '2026-10-14' }));

const { default: AddFoodDialog } = await import('../FoodLog/AddFoodDialog.jsx');

const food = (name) => ({
  id: name, name, source: 'custom',
  nutrition: { calories_per_serving: 200, protein_grams: 6, carbs_grams: 30, fat_grams: 8 },
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  suggest.mockResolvedValue([food('Homemade quesadilla'), food('Greek yogurt')]);
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

  /** Phase 1.5: she backfills (§2a); the sheet never said which day it wrote to. */
  it.each([
    ['2026-10-14', 'Add to dinner'],
    ['2026-10-13', "Add to yesterday's dinner"],
    ['2026-10-12', "Add to Monday's dinner"],
    ['2026-10-03', 'Add to dinner on Saturday, October 3'],
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
});
