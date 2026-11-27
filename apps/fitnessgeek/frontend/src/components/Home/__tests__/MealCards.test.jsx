/**
 * The day's meals on Today (DOCS/ONE_APP_PLAN.md §1.5): one card, a row per
 * meal, its foods under it. Each meal has "Add" and a small "more" menu
 * holding Copy from another day and Save as a meal; a food row opens Edit.
 * The meals are on the page they used to link to, so nothing here is a link.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MealCards from '../MealCards.jsx';
import { logsByMeal } from '../mealGroups.js';

const log = (id, name, meal, cal, servings = 1) => ({
  id, meal_type: meal, servings, nutrition: { calories_per_serving: cal }, food_item_id: { id: `f-${id}`, name },
});
const LOGS = [
  log('c', 'Turkey chili', 'lunch', 640),
  log('e', 'Egg', 'breakfast', 78, 2),
  log('t', 'Toast', 'breakfast', 90),
];

const mount = (props = {}) => {
  const handlers = { onAdd: vi.fn(), onEdit: vi.fn(), onCopy: vi.fn(), onSaveMeal: vi.fn() };
  render(<MemoryRouter><MealCards logs={LOGS} date="2026-10-13" {...handlers} {...props} /></MemoryRouter>);
  return handlers;
};

describe('MealCards', () => {
  it('is one card with the four meals in order, each with its own Add', () => {
    const { onAdd } = mount();
    const cards = within(screen.getByTestId('meal-cards')).getAllByRole('region');
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual(['meal-card-breakfast', 'meal-card-lunch', 'meal-card-dinner', 'meal-card-snack']);
    expect(cards.map((c) => c.id)).toEqual(['meal-card-breakfast', 'meal-card-lunch', 'meal-card-dinner', 'meal-card-snack']);
    fireEvent.click(screen.getByRole('button', { name: 'Add to dinner' }));
    expect(onAdd).toHaveBeenCalledWith('dinner');
    fireEvent.click(screen.getByRole('button', { name: 'Add to snacks' }));
    expect(onAdd).toHaveBeenLastCalledWith('snack');
  });

  it("a meal's total is the sum of its rows; an empty meal says Nothing yet", () => {
    mount();
    expect(screen.getByTestId('meal-total-breakfast')).toHaveTextContent('246 cal');
    expect(screen.getByTestId('meal-total-lunch')).toHaveTextContent('640 cal');
    expect(screen.getByTestId('meal-total-dinner')).toHaveTextContent('Nothing yet');
  });

  it('every entry keeps its own row, with its amount and calories, and a tap opens Edit', () => {
    const { onEdit } = mount();
    const rows = within(screen.getByTestId('meal-card-breakfast')).getAllByTestId('food-log-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Egg');
    expect(rows[0]).toHaveTextContent('×2');
    expect(rows[0]).toHaveTextContent('156 cal');
    fireEvent.click(rows[0]);
    expect(onEdit).toHaveBeenCalledWith(LOGS[1]);
  });

  it('the more menu holds Copy from another day and Save as a meal', () => {
    const { onCopy, onSaveMeal } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'More for breakfast' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy from another day' }));
    expect(onCopy).toHaveBeenCalledWith('breakfast');

    fireEvent.click(screen.getByRole('button', { name: 'More for breakfast' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as a meal' }));
    expect(onSaveMeal).toHaveBeenCalledWith('breakfast', [LOGS[1], LOGS[2]]);
  });

  it('an empty meal can be copied into, but there is nothing to save', () => {
    const { onSaveMeal } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'More for dinner' }));
    expect(screen.getByRole('menuitem', { name: 'Copy from another day' })).not.toHaveAttribute('aria-disabled', 'true');
    const save = screen.getByRole('menuitem', { name: 'Save as a meal' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(save);
    expect(onSaveMeal).not.toHaveBeenCalled();
  });

  it('a day that could not be read says "—", never "Nothing yet"', () => {
    mount({ logs: [], unknown: true });
    expect(screen.getByTestId('meal-total-lunch')).toHaveTextContent('—');
    expect(screen.getByTestId('meal-cards').textContent).not.toMatch(/Nothing yet/);
  });

  it('shows the "Just added" strip on the meal it belongs to', () => {
    const justAdded = { renderFor: (meal, date) => (meal === 'lunch' && date === '2026-10-13' ? <div data-testid="strip" /> : null) };
    mount({ justAdded });
    expect(within(screen.getByTestId('meal-card-lunch')).getByTestId('strip')).toBeInTheDocument();
    expect(within(screen.getByTestId('meal-card-breakfast')).queryByTestId('strip')).toBeNull();
  });

  it('nothing is a link: the meals are on this page now', () => {
    mount();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('logsByMeal', () => {
  it('groups by meal, and an entry with an unknown meal counts as a snack', () => {
    const groups = logsByMeal([...LOGS, { id: 'x', meal_type: 'brunch' }, { id: 'y' }]);
    expect(groups.breakfast.map((l) => l.id)).toEqual(['e', 't']);
    expect(groups.lunch.map((l) => l.id)).toEqual(['c']);
    expect(groups.dinner).toEqual([]);
    expect(groups.snack.map((l) => l.id)).toEqual(['x', 'y']);
  });
});
