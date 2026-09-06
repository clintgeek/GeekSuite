/**
 * SaveMealDialog used to send `food_item_payload` inside `MealItemInput` for
 * any log row it couldn't resolve a catalog `food_item_id` for. The gateway's
 * `MealItemInput` (`apps/basegeek/packages/api/src/graphql/fitnessgeek/typeDefs.js`)
 * declares only `food_item_id: ID!` / `servings: Float!` — no such field
 * exists to receive a payload, so graphql-js would reject the whole
 * `createFitnessMeal`/`updateFitnessMeal` call the moment that branch was
 * reached, taking every other item in the meal down with it.
 *
 * Today's `addFoodLog` always resolves a real `food_item_id` via
 * findOrCreate, so a log row with no id shouldn't exist in practice — but if
 * one ever does (stale data, a soft-deleted catalog row), the dialog now
 * skips it and says so, rather than sending the undeclared field.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SaveMealDialog from '../FoodLog/SaveMealDialog.jsx';

const resolvableLog = {
  food_item_id: { id: 'food-1', name: 'Chicken Breast', nutrition: { calories_per_serving: 200 } },
  servings: 1
};

// No `.id`/`._id` anywhere reachable — this is the row `resolveFoodId` can't
// turn into a `food_item_id`.
const unresolvableLog = {
  food_item: { name: 'Mystery Leftover', nutrition: { calories_per_serving: 150 } },
  servings: 2
};

describe('SaveMealDialog food_items payload', () => {
  it('sends only rows with a resolvable food id, never food_item_payload', () => {
    const onSave = vi.fn();
    render(
      <SaveMealDialog
        open
        onClose={vi.fn()}
        onSave={onSave}
        mealType="lunch"
        logs={[resolvableLog, unresolvableLog]}
      />
    );

    fireEvent.change(screen.getByLabelText(/Meal Name/i), { target: { value: 'Test Meal' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Meal/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.food_items).toEqual([{ food_item_id: 'food-1', servings: 1 }]);
    for (const item of payload.food_items) {
      expect(item).not.toHaveProperty('food_item_payload');
    }
  });

  it('renders a visible note for items with no catalog entry', () => {
    render(
      <SaveMealDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        mealType="lunch"
        logs={[resolvableLog, unresolvableLog]}
      />
    );

    expect(
      screen.getByText(/1 item could not be saved to the meal/i)
    ).toBeInTheDocument();
  });

  it('does not render the note when every item resolves', () => {
    render(
      <SaveMealDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        mealType="lunch"
        logs={[resolvableLog]}
      />
    );

    expect(screen.queryByText(/could not be saved/i)).toBeNull();
  });

  it('disables Save Meal when nothing in the meal resolves to a catalog id', () => {
    render(
      <SaveMealDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        mealType="lunch"
        logs={[unresolvableLog]}
      />
    );

    fireEvent.change(screen.getByLabelText(/Meal Name/i), { target: { value: 'Test Meal' } });
    expect(screen.getByRole('button', { name: /Save Meal/i })).toBeDisabled();
  });
});
