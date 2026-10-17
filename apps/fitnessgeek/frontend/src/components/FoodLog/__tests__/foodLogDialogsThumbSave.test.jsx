/**
 * UX review L9: every save in the Food Log's dialogs sits at the bottom on a
 * phone (thumbSaveProps), the way Weight and BP already did. Edit entry and
 * Copy a meal have their own tests; these are the rest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SaveMealDialog from '../SaveMealDialog.jsx';
import EditMealDialog from '../../Meals/EditMealDialog.jsx';
import FoodEditDialog from '../../MyFoods/FoodEditDialog.jsx';

const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  window.matchMedia = (query) => ({
    matches: true, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
});
afterEach(() => { window.matchMedia = originalMatchMedia; });

const onlyAtTheBottom = (name) => {
  const bottom = screen.getByTestId('thumb-save');
  expect(within(bottom).getByRole('button', { name, hidden: true })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name, hidden: true })).toHaveLength(1);
};

describe('Food Log dialogs: Save under the thumb', () => {
  it('Save as a meal', () => {
    const logs = [{ id: 'l1', servings: 1, nutrition: { calories_per_serving: 100 }, food_item_id: { id: 'f1', name: 'Toast' } }];
    render(<SaveMealDialog open onClose={vi.fn()} onSave={vi.fn()} mealType="dinner" logs={logs} />);
    expect(screen.getByText('Save dinner as a meal')).toBeInTheDocument();
    onlyAtTheBottom(/^save$/i);
  });

  it('Edit a saved meal', () => {
    const meal = { id: 'm1', name: 'Taco night', meal_type: 'dinner', food_items: [] };
    render(<EditMealDialog open onClose={vi.fn()} onSave={vi.fn()} meal={meal} />);
    onlyAtTheBottom(/^save$/i);
  });

  it('Create a food', () => {
    render(<FoodEditDialog open food={null} form={{ name: 'Soup' }} onChange={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} />);
    onlyAtTheBottom(/^save food$/i);
  });
});
