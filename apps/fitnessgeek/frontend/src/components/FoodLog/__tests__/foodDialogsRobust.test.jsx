/**
 * The food dialogs against bad data, and where things sit in Edit entry.
 *
 *  - A null row in a meal's entries (or in a saved meal's foods) threw on
 *    `log.food_item` and took the page to the error boundary.
 *  - Edit entry's favorite and Remove were the last things in the form,
 *    under the fold on a phone; they sit under the food's name now.
 *  - The per-serving fields had 6px between rows, so the second row's label
 *    touched the first row.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../../services/foodService.js', () => ({
  foodService: { getFavorites: vi.fn().mockResolvedValue([]), addFavorite: vi.fn(), removeFavorite: vi.fn() },
}));

import SaveMealDialog from '../SaveMealDialog.jsx';
import EditLogDialog from '../EditLogDialog.jsx';
import NutritionInputs from '../NutritionInputs.jsx';
import EditMealDialog from '../../Meals/EditMealDialog.jsx';

// The suite's spacing unit is 4px; the bare MUI theme's is 8.
const theme = createTheme({ spacing: 4 });
const wrap = (node) => render(<ThemeProvider theme={theme}>{node}</ThemeProvider>);

beforeEach(() => vi.clearAllMocks());

describe('Save as a meal', () => {
  it('skips a null entry and an entry with no food, and still totals the rest', () => {
    const onSave = vi.fn();
    wrap(
      <SaveMealDialog
        open
        onClose={vi.fn()}
        onSave={onSave}
        mealType="breakfast"
        logs={[
          null,
          { id: 'l1', servings: 2, nutrition: { calories_per_serving: 78 }, food_item_id: { id: 'f1', name: 'Egg' } },
          { id: 'l2', servings: 1, nutrition: null, food_item_id: null },
          undefined,
        ]}
      />
    );
    expect(screen.getByText('Egg')).toBeInTheDocument();
    expect(screen.getByText('156 cal')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Eggs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'Eggs', meal_type: 'breakfast', food_items: [{ food_item_id: 'f1', servings: 2 }] });
  });

  it('no list at all is nothing to save, not a crash', () => {
    wrap(<SaveMealDialog open onClose={vi.fn()} onSave={vi.fn()} mealType="lunch" logs={null} />);
    expect(screen.getByText('There is nothing in this meal to save yet.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'X' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('does not send twice while a save is in flight, and keeps the name', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const logs = [{ id: 'l1', servings: 1, food_item_id: { id: 'f1', name: 'Egg' } }];
    const { rerender } = wrap(<SaveMealDialog open onClose={onClose} onSave={onSave} mealType="lunch" logs={logs} />);
    fireEvent.change(screen.getByLabelText('Meal name'), { target: { value: 'Eggs' } });
    rerender(<ThemeProvider theme={theme}><SaveMealDialog open loading onClose={onClose} onSave={onSave} mealType="lunch" logs={logs} /></ThemeProvider>);
    fireEvent.submit(screen.getByLabelText('Meal name').closest('form'));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Meal name')).toHaveValue('Eggs');
  });
});

describe('Edit a saved meal', () => {
  it('skips a null food and a food that was deleted keeps a plain name', () => {
    wrap(
      <EditMealDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        meal={{ id: 'm1', name: 'Taco night', meal_type: 'brunch', food_items: [null, { servings: 2, food_item_id: { id: 'f1', name: 'Taco' } }, { servings: 1, food_item_id: null }] }}
      />
    );
    expect(screen.getByText('Taco')).toBeInTheDocument();
    expect(screen.getByText('A food')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Servings')).toHaveLength(2);
  });

  it('will not save a blank servings box as "1"', () => {
    const onSave = vi.fn();
    wrap(
      <EditMealDialog open onClose={vi.fn()} onSave={onSave} meal={{ id: 'm1', name: 'Taco night', meal_type: 'dinner', food_items: [{ servings: 2, food_item_id: { id: 'f1', name: 'Taco' } }] }} />
    );
    fireEvent.change(screen.getByLabelText('Servings'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Servings'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'Taco night', meal_type: 'dinner', food_items: [{ food_item_id: 'f1', servings: 3 }] });
  });
});

describe('Edit entry', () => {
  const LOG = { id: 'log-1', servings: 1, meal_type: 'lunch', log_date: '2026-10-15T00:00:00.000Z', nutrition: { calories_per_serving: 220 }, food_item_id: { id: 'f1', name: 'Chicken soup', brand: 'Home' } };

  it('favorite and Remove sit under the name, before the first field', async () => {
    wrap(<EditLogDialog open onClose={vi.fn()} onSave={vi.fn()} onRemove={vi.fn()} log={LOG} />);
    const star = await screen.findByTestId('edit-log-favorite');
    const remove = screen.getByRole('button', { name: 'Remove Chicken soup' });
    const calories = screen.getByLabelText('Calories');
    const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(screen.getByText('Chicken soup'), star)).toBe(true);
    expect(before(star, calories)).toBe(true);
    expect(before(remove, calories)).toBe(true);
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('opens on an entry with no nutrition and a food that is only an id', () => {
    wrap(<EditLogDialog open onClose={vi.fn()} onSave={vi.fn()} onRemove={vi.fn()} log={{ id: 'log-2', servings: null, nutrition: null, food_item_id: 'f9' }} />);
    expect(screen.getByLabelText('Calories')).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: 'Per serving and nutrition' }));
    expect(screen.getByText('Protein 0g')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });
});

describe('NutritionInputs', () => {
  it('leaves 16px between its rows, so a label never touches the row above', () => {
    wrap(<NutritionInputs values={{}} onChange={vi.fn()} />);
    expect(screen.getByTestId('nutrition-inputs')).toHaveStyle({ rowGap: '16px' });
  });
});
