/**
 * A logged food's row (DOCS/ONE_APP_PLAN.md §1.5): the name, the amount and
 * the calories, and the whole row opens Edit. It used to come in two kinds
 * (one with a macro line, a star, a pencil, a trash can and a swipe); there
 * is one kind now, and everything those did lives in Edit.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FoodLogItem from '../FoodLogItem.jsx';
import { caloriesOf, nutritionOf, servingsOf } from '../amount.js';

const EGGS = {
  id: 'log-eggs',
  meal_type: 'breakfast',
  servings: 2,
  nutrition: { calories_per_serving: 78, protein_grams: 6, carbs_grams: 1, fat_grams: 5 },
  food_item_id: { id: 'f-egg', name: 'Egg', brand: 'Happy Hens' },
};

describe('FoodLogItem', () => {
  it('is the name, the amount and the calories — no macros, brand, star, pencil or trash', () => {
    render(<FoodLogItem log={EGGS} onEdit={vi.fn()} />);
    const row = screen.getByTestId('food-log-row');
    expect(row).toHaveTextContent('Egg');
    expect(row).toHaveTextContent('×2');
    expect(row).toHaveTextContent('156 cal');
    expect(row.textContent).not.toMatch(/Protein|Carbs|Fat|P \d|Happy Hens/);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /favorite/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
  });

  it('says the whole thing to a screen reader, and one serving says no amount', () => {
    const { rerender } = render(<FoodLogItem log={EGGS} onEdit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Edit Egg, ×2, 156 cal' })).toBeInTheDocument();
    rerender(<FoodLogItem log={{ ...EGGS, servings: 1 }} onEdit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Edit Egg, 78 cal' })).toBeInTheDocument();
  });

  it('a tap anywhere on the row opens Edit with that entry', () => {
    const onEdit = vi.fn();
    render(<FoodLogItem log={EGGS} onEdit={onEdit} />);
    fireEvent.click(screen.getByTestId('food-log-row'));
    expect(onEdit).toHaveBeenCalledWith(EGGS);
  });

  it('thousands get a comma', () => {
    render(<FoodLogItem log={{ ...EGGS, servings: 1, nutrition: { calories_per_serving: 1250 } }} />);
    expect(screen.getByTestId('food-log-row')).toHaveTextContent('1,250 cal');
  });

  it('draws nothing for an entry whose food is gone', () => {
    const { container } = render(<FoodLogItem log={{ id: 'x', servings: 1 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('what an entry comes to', () => {
  it("uses the entry's own stored nutrition when it has one, else the food's", () => {
    expect(nutritionOf(EGGS).calories_per_serving).toBe(78);
    const bare = { servings: 1, nutrition: {}, food_item: { name: 'Toast', nutrition: { calories_per_serving: 90 } } };
    expect(nutritionOf(bare).calories_per_serving).toBe(90);
    expect(caloriesOf(bare)).toBe(90);
  });

  it('multiplies by the servings, which may arrive as text, and is 1 when missing', () => {
    expect(servingsOf({ servings: '1.5' })).toBe(1.5);
    expect(servingsOf({})).toBe(1);
    expect(caloriesOf(EGGS)).toBe(156);
    expect(caloriesOf({ ...EGGS, servings: '1.5' })).toBe(117);
  });

  it('is 0, not NaN, for an entry with no nutrition at all', () => {
    expect(caloriesOf({ servings: 2, food_item: { name: 'Mystery' } })).toBe(0);
    expect(caloriesOf(null)).toBe(0);
  });
});
