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
});
