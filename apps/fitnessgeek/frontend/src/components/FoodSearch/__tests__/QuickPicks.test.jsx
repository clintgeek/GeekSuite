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
const { default: QuickPicks } = await import('../QuickPicks.jsx');

describe('QuickPicks', () => {
  it("\"Same as yesterday's lunch\" logs exactly yesterday's lunch, at its servings", () => {
    const onPick = vi.fn();
    render(<QuickPicks date="2026-09-27" mealType="lunch" onPick={onPick} />);
    const same = screen.getByRole('button', { name: /same as yesterday's lunch/i });
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
    expect(onPick).toHaveBeenCalledWith([expect.objectContaining({ id: 'caesar', name: 'Caesar salad', servings: 1 })]);
  });

  it('nothing to repeat → nothing shown', () => {
    const { container } = render(<QuickPicks date="2026-09-27" mealType="breakfast" onPick={vi.fn()} />);
    // Breakfast has no yesterday; the only habits are other meals' (still chips).
    expect(screen.queryByRole('button', { name: /same as yesterday/i })).toBeNull();
    expect(container.querySelector('[data-testid="again-chips"]')).not.toBeNull();
  });
});
