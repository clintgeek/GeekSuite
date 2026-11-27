/**
 * Favorites on the add sheet. The star is set in Edit entry; until now a
 * starred food that hadn't been eaten twice in four weeks was nowhere on the
 * sheet (only a small star on a row inside the folded "Your foods" list).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const logs = [];
const add = (id, name, meal, day) => logs.push({
  id: `${id}-${day}`, meal_type: meal, servings: 1, log_date: `${day}T00:00:00.000Z`,
  nutrition: { calories_per_serving: 100 }, food_item_id: { id, name },
});
add('caesar', 'Caesar salad', 'lunch', '2026-09-24');
add('caesar', 'Caesar salad', 'lunch', '2026-09-22');

let recent = { logs, meals: [], loading: false };
vi.mock('../../../hooks/useRecentLogs.js', () => ({ useRecentLogs: () => recent }));
vi.mock('../useHouseholdMeals.js', () => ({ useHouseholdMeals: () => [] }));
vi.mock('../../../hooks/useToday.js', () => ({ useToday: () => '2026-09-27' }));
const getFavorites = vi.fn();
vi.mock('../../../services/foodService.js', () => ({ foodService: { getFavorites: (...a) => getFavorites(...a) } }));

const { default: QuickPicks } = await import('../QuickPicks.jsx');
const { forgetFavorites } = await import('../useFavoriteFoods.js');

beforeEach(() => {
  vi.clearAllMocks();
  forgetFavorites();
  recent = { logs, meals: [], loading: false };
});

describe('QuickPicks: favorites', () => {
  it('offers a starred food that is not an Again chip, one serving a tap', async () => {
    getFavorites.mockResolvedValue([
      { id: 'salmon', name: 'Salmon fillet', nutrition: { calories_per_serving: 280 } },
      { id: 'caesar', name: 'Caesar salad' },
      null,
      { name: 'No id' },
    ]);
    const onPick = vi.fn();
    render(<QuickPicks date="2026-09-27" mealType="lunch" onPick={onPick} />);
    const chip = await screen.findByRole('button', { name: 'Add Salmon fillet to lunch' });
    // Only the favorite that isn't already an Again chip; bad rows are skipped.
    expect(screen.getByTestId('favorite-chips').querySelectorAll('[role="button"]')).toHaveLength(1);
    fireEvent.click(chip);
    expect(onPick).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'salmon', name: 'Salmon fillet', servings: 1, nutrition: { calories_per_serving: 280 } })],
      'quick:id:salmon'
    );
    // The Again chip that is a favorite carries a star.
    expect(screen.getByTestId('again-chips').querySelector('[data-testid="chip-star"]')).not.toBeNull();
  });

  it('shows favorites even with no history at all', async () => {
    recent = { logs: [], meals: [], loading: false };
    getFavorites.mockResolvedValue([{ id: 'salmon', name: 'Salmon fillet' }]);
    render(<QuickPicks date="2026-09-27" mealType="lunch" onPick={vi.fn()} heading="Or tap one you’ve had" />);
    expect(await screen.findByRole('button', { name: 'Add Salmon fillet to lunch' })).toBeInTheDocument();
    expect(screen.getByText('Favorites')).toBeInTheDocument();
  });

  it('a failed read shows no favorites and breaks nothing', async () => {
    getFavorites.mockRejectedValue(new Error('offline'));
    render(<QuickPicks date="2026-09-27" mealType="lunch" onPick={vi.fn()} />);
    await waitFor(() => expect(getFavorites).toHaveBeenCalled());
    expect(screen.getByTestId('again-chips')).toBeInTheDocument();
    expect(screen.queryByTestId('favorite-chips')).toBeNull();
  });

  it('reads once per sitting, and again after a star changes', async () => {
    getFavorites.mockResolvedValue([{ id: 'salmon', name: 'Salmon fillet' }]);
    const first = render(<QuickPicks date="2026-09-27" mealType="lunch" onPick={vi.fn()} />);
    await screen.findByTestId('favorite-chips');
    first.unmount();
    const second = render(<QuickPicks date="2026-09-27" mealType="lunch" onPick={vi.fn()} />);
    await screen.findByTestId('favorite-chips');
    expect(getFavorites).toHaveBeenCalledTimes(1);
    second.unmount();
    forgetFavorites();
    render(<QuickPicks date="2026-09-27" mealType="lunch" onPick={vi.fn()} />);
    await screen.findByTestId('favorite-chips');
    expect(getFavorites).toHaveBeenCalledTimes(2);
  });
});
