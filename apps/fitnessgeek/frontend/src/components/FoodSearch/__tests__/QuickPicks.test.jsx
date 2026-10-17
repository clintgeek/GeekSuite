/**
 * One-tap logging in the add box: "Same as yesterday's lunch" and the Again
 * chips hand real, re-loggable items to the box's own logger
 * (DOCS/SIMPLE_AND_FULL_PLAN.md item 2).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const logs = [];
const add = (id, name, meal, day, servings = 1) => logs.push({
  id: `${id}-${day}`, meal_type: meal, servings, log_date: `${day}T00:00:00.000Z`,
  nutrition: { calories_per_serving: 100 }, food_item_id: { id, name },
});
add('caesar', 'Caesar salad', 'lunch', '2026-09-26');
add('toast', 'Toast', 'lunch', '2026-09-26', 2);
add('caesar', 'Caesar salad', 'lunch', '2026-09-24');
add('caesar', 'Caesar salad', 'lunch', '2026-09-22');
add('almonds', 'Almonds', 'snack', '2026-09-25');
add('almonds', 'Almonds', 'snack', '2026-09-23');

vi.mock('../../../hooks/useRecentLogs.js', () => ({ useRecentLogs: () => ({ logs, meals: [], loading: false }) }));
let household = [];
const householdCalls = [];
vi.mock('../useHouseholdMeals.js', () => ({ useHouseholdMeals: (...a) => { householdCalls.push(a); return household; } }));
// "Yesterday" is named relative to the real today, so pin it.
let today = '2026-09-27';
vi.mock('../../../hooks/useToday.js', () => ({ useToday: () => today }));
const { default: QuickPicks } = await import('../QuickPicks.jsx');

describe('QuickPicks', () => {
  it("\"Same as yesterday's lunch\" logs exactly yesterday's lunch, at its servings", () => {
    const onPick = vi.fn();
    render(<QuickPicks date="2026-09-27" mealType="lunch" onPick={onPick} />);
    const same = screen.getByRole('button', { name: /same as yesterday’s lunch/i });
    expect(same).toHaveTextContent('Caesar salad, Toast');
    fireEvent.click(same);
    expect(onPick.mock.calls[0][0].map((i) => [i.name, i.servings])).toEqual([['Caesar salad', 1], ['Toast', 2]]);
  });

  it('the lunch chips lead with what he has for lunch, and a chip logs that food again', () => {
    const onPick = vi.fn();
    render(<QuickPicks date="2026-09-27" mealType="lunch" onPick={onPick} />);
    const chips = screen.getAllByRole('button', { name: /again$/ });
    expect(chips.map((c) => c.getAttribute('aria-label'))).toEqual(['Add Caesar salad to lunch again', 'Add Almonds to lunch again']);
    fireEvent.click(chips[0]);
    expect(onPick.mock.calls[0][0]).toEqual([expect.objectContaining({ id: 'caesar', name: 'Caesar salad', servings: 1 })]);
  });

  it('nothing to repeat → nothing shown', () => {
    const { container } = render(<QuickPicks date="2026-09-27" mealType="breakfast" onPick={vi.fn()} />);
    // Breakfast has no yesterday; the only habits are other meals' (still chips).
    expect(screen.queryByRole('button', { name: /same as yesterday/i })).toBeNull();
    expect(container.querySelector('[data-testid="again-chips"]')).not.toBeNull();
  });

  it("names the actual day when the day on screen isn't today (review Phase 1.5)", () => {
    // Backfilling Saturday the 26th, from Monday the 28th: the button copies
    // Friday's lunch and says so, instead of "yesterday's".
    today = '2026-09-28';
    logs.push({
      id: 'soup-25', meal_type: 'lunch', servings: 1, log_date: '2026-09-25T00:00:00.000Z',
      nutrition: { calories_per_serving: 220 }, food_item_id: { id: 'soup', name: 'Chicken soup' },
    });
    try {
      render(<QuickPicks date="2026-09-26" mealType="lunch" onPick={vi.fn()} />);
      expect(screen.getByRole('button', { name: /same as friday’s lunch/i })).toHaveTextContent('Chicken soup');
      expect(screen.queryByRole('button', { name: /yesterday’s/i })).toBeNull();
    } finally {
      logs.pop();
      today = '2026-09-27';
    }
  });

  it('on yesterday, it is the day before yesterday that gets copied — by name', () => {
    today = '2026-09-28';
    try {
      render(<QuickPicks date="2026-09-27" mealType="lunch" onPick={vi.fn()} />);
      expect(screen.getByRole('button', { name: /same as saturday’s lunch/i })).toHaveTextContent('Caesar salad, Toast');
    } finally {
      today = '2026-09-27';
    }
  });

  it("L7: \"Same as Chef's dinner\" for a sharing member who logged this meal today, named as he named himself", () => {
    household = [{ userId: 'chef-1', name: 'Chef', foods: ['Steak', 'Baked potato', 'Salad', 'Roll'], calories: 1100, count: 4 }];
    try {
      const onPick = vi.fn();
      render(<QuickPicks date="2026-09-27" mealType="dinner" onPick={onPick} />);
      expect(householdCalls.at(-1)).toEqual(['2026-09-27', 'dinner']);
      const pick = screen.getByRole('button', { name: "Same as Chef’s dinner" });
      expect(pick).toHaveTextContent('Steak, Baked potato, Salad and 1 more');
      fireEvent.click(pick);
      expect(onPick).toHaveBeenCalledWith([expect.objectContaining({
        type: 'household-meal', name: "Chef’s dinner", fromUserId: 'chef-1', fromDate: '2026-09-27', fromMealType: 'dinner',
        nutrition: { calories_per_serving: 1100 },
      })], 'quick:household:chef-1');
    } finally {
      household = [];
    }
  });

  it('L7: nothing shared for this meal → no pick, and nothing at all when there is nothing else', () => {
    household = [];
    const { container } = render(<QuickPicks date="2026-09-27" mealType="dinner" onPick={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /same as chef/i })).toBeNull();
    expect(container.querySelector('[data-testid="same-as-household"]')).toBeNull();
  });
});
