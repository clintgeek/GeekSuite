/**
 * Review 2026-11-27 (scene 71a) and the shared decision on macro shorthand:
 * a saved food's row ended in "P 18 · C 8 · F 10 g". It leads with the
 * calories now; protein, carbs and fat are in the edit view.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FoodListItem from '../FoodListItem.jsx';
import FoodDeleteDialog from '../FoodDeleteDialog.jsx';

const YOGURT = { id: 'y', name: 'Greek Yogurt, Plain Whole Milk', brand: 'Fage', source: 'custom', nutrition: { calories_per_serving: 190, protein_grams: 18, carbs_grams: 8, fat_grams: 10 } };

describe('a saved food row', () => {
  it('leads with the calories and has no macro shorthand', () => {
    render(<ul><FoodListItem food={YOGURT} /></ul>);
    const row = screen.getByTestId('saved-food-row');
    expect(screen.getByTestId('saved-food-calories')).toHaveTextContent(/^190 cal$/);
    expect(row.textContent).not.toMatch(/P 18|C 8|F 10/);
    expect(row).toHaveTextContent('Fage');
    // The calories come before the brand on the quiet line.
    expect(row.textContent.indexOf('190 cal')).toBeLessThan(row.textContent.indexOf('Fage'));
  });

  it('draws a shouted name in title case, and still hands back the stored food', () => {
    const onEdit = vi.fn();
    const bar = { ...YOGURT, name: 'CHOCOLATE PEANUT BUTTER protein bar', brand: 'ONE' };
    render(<ul><FoodListItem food={bar} onEdit={onEdit} /></ul>);
    expect(screen.getByText('Chocolate Peanut Butter protein bar')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Chocolate Peanut Butter protein bar' }));
    expect(onEdit).toHaveBeenCalledWith(bar);
  });

  it('a food with no nutrition and no name still draws', () => {
    render(<ul><FoodListItem food={{ id: 'x' }} /></ul>);
    expect(screen.getByText('Unnamed food')).toBeInTheDocument();
    expect(screen.getByTestId('saved-food-calories')).toHaveTextContent('0 cal');
  });
});

describe('deleting a saved food', () => {
  it('the confirm is text in the error colour, never a filled red button', () => {
    const onConfirm = vi.fn();
    render(<FoodDeleteDialog open food={YOGURT} onClose={vi.fn()} onConfirm={onConfirm} />);
    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm.className).toMatch(/MuiButton-textError/);
    expect(confirm.className).not.toMatch(/MuiButton-contained/);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
