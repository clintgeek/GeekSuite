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
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

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
      screen.getByText(/1 food can’t go in a saved meal/i)
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

    expect(screen.queryByText(/can’t go in a saved meal/i)).toBeNull();
  });

  it('disables Save when nothing in the meal resolves to a catalog id', () => {
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
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });
});

/**
 * REVIEW_2026-10 P2: the preview read `food_item.nutrition`, which the Food
 * Log query doesn't select, so a real meal previewed as "0 cal".
 */
describe('SaveMealDialog preview totals', () => {
  it('adds up the log rows as the Food Log fetches them', () => {
    const logs = [
      { food_item_id: { id: 'egg', name: 'Egg' }, servings: 2, nutrition: { calories_per_serving: 70, protein_grams: 6, carbs_grams: 0, fat_grams: 5 } },
      { food_item_id: { id: 'toast', name: 'Toast' }, servings: 1, nutrition: { calories_per_serving: 80, protein_grams: 3, carbs_grams: 15, fat_grams: 1 } }
    ];
    render(<SaveMealDialog open onClose={vi.fn()} onSave={vi.fn()} mealType="breakfast" logs={logs} />);
    expect(screen.getByText('220 cal')).toBeInTheDocument();
    expect(screen.getByText('Protein 15g')).toBeInTheDocument();
  });
});
