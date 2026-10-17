import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mocked at the shape the services REALLY resolve to: foodService.suggest /
// search return the row array, parseRecipe returns the ingredient rows,
// create / update resolve to the saved food.
const svc = vi.hoisted(() => ({
  suggest: vi.fn(),
  search: vi.fn(),
  parseRecipe: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../../../services/foodService.js', () => ({ foodService: svc, default: svc }));

const notify = vi.hoisted(() => vi.fn());
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify }),
}));

import RecipeBuilderDialog from '../RecipeBuilderDialog.jsx';

const macros = (cal, p = 0, c = 0, f = 0) => ({
  calories_per_serving: cal, protein_grams: p, carbs_grams: c, fat_grams: f,
  fiber_grams: 0, sugar_grams: 0, sodium_mg: 0,
});

// Search rows as /foods/suggest returns them: nested `serving`.
const chicken = { id: 'a'.repeat(24), name: 'Chicken breast', serving: { size: 100, unit: 'g' }, nutrition: macros(200, 30, 0, 8), source: 'custom' };
const rice = { id: 'usda_55', name: 'White rice', serving: { size: 100, unit: 'g' }, nutrition: macros(130, 3, 28, 0), source: 'usda' };

const setup = (props = {}) => {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<RecipeBuilderDialog open food={null} onClose={onClose} onSaved={onSaved} {...props} />);
  return { user, onClose, onSaved };
};

const addIngredient = async (user, foodName) => {
  await user.click(screen.getByRole('button', { name: /add ingredient/i }));
  await user.click(await screen.findByRole('button', { name: new RegExp(foodName, 'i') }));
  await pickerGone();
};

// The picker sits over the builder; MUI keeps the builder aria-hidden until
// the picker's exit transition ends, so wait for it before querying by role.
const pickerGone = () => waitFor(() => expect(screen.queryByLabelText('Search foods')).not.toBeInTheDocument());

const setAmount = async (user, foodName, value) => {
  const field = screen.getByLabelText(`Amount of ${foodName}`);
  await user.clear(field);
  await user.type(field, value);
};

const saveButton = () => screen.getByRole('button', { name: /save recipe/i });

beforeEach(() => {
  Object.values(svc).forEach((f) => f.mockReset());
  notify.mockReset();
  svc.suggest.mockResolvedValue([chicken, rice]);
  svc.create.mockResolvedValue({ id: 'new' });
  svc.update.mockResolvedValue({ id: 'x' });
});

describe('recipe builder: live preview and save', () => {
  it('shows per-serving and batch calories from the ingredients and yield', async () => {
    const { user } = setup();

    await addIngredient(user, 'Chicken breast');
    await setAmount(user, 'Chicken breast', '2'); // 2 servings = 400 kcal
    await addIngredient(user, 'White rice');
    await user.selectOptions(screen.getByLabelText('Unit for White rice'), 'g');
    await setAmount(user, 'White rice', '200'); // 200 g of a 100 g serving = 260 kcal
    await user.type(screen.getByLabelText(/makes \(servings\)/i), '4');

    // (400 + 260) / 4 = 165
    expect(screen.getByText('165 cal per serving')).toBeInTheDocument();
    expect(screen.getByText('Whole batch 660 cal')).toBeInTheDocument();
    // per-row kcal follows the unit conversion
    expect(screen.getByText('260 cal')).toBeInTheDocument();
  });

  it('writes protein, carbs and fat in words, and a dash when none is known (review U-4)', async () => {
    const plain = { id: 'b'.repeat(24), name: 'Mystery stew', serving: { size: 1, unit: 'cup' }, nutrition: macros(300), source: 'custom' };
    svc.suggest.mockResolvedValue([chicken, plain]);
    const { user } = setup();

    await addIngredient(user, 'Chicken breast');
    await user.type(screen.getByLabelText(/makes \(servings\)/i), '1');
    expect(screen.getByText('Protein 30g · Carbs 0g · Fat 8g')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Chicken breast' }));
    await addIngredient(user, 'Mystery stew');
    expect(screen.getByText('Protein — · Carbs — · Fat —')).toBeInTheDocument();
    expect(screen.queryByText(/P 0g/)).toBeNull();
  });

  it('keeps Save disabled until name, a resolved ingredient and a yield exist', async () => {
    const { user } = setup();
    expect(saveButton()).toBeDisabled();

    await user.type(screen.getByLabelText(/recipe name/i), 'Chili');
    await addIngredient(user, 'Chicken breast');
    expect(saveButton()).toBeDisabled(); // no yield yet

    await user.type(screen.getByLabelText(/makes \(servings\)/i), '2.5');
    expect(saveButton()).toBeEnabled();
  });

  it('keeps Save disabled while a pasted line is unresolved, then enables it once picked', async () => {
    svc.parseRecipe.mockResolvedValue([
      { line: '1 lb ground beef', name: 'ground beef', unresolved: true },
    ]);
    const { user } = setup();
    await user.type(screen.getByLabelText(/recipe name/i), 'Chili');
    await user.type(screen.getByLabelText(/makes \(servings\)/i), '4');
    await addIngredient(user, 'Chicken breast');
    expect(saveButton()).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /paste ingredients/i }));
    await user.type(screen.getByLabelText(/ingredient list/i), '1 lb ground beef');
    await user.click(screen.getByRole('button', { name: /add to recipe/i }));

    expect(await screen.findByText(/couldn.t match/i)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /pick a food/i }));
    await user.click(await screen.findByRole('button', { name: /white rice/i }));
    await pickerGone();

    expect(screen.queryByText(/couldn.t match/i)).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    // the picked food replaces the unresolved row in place: 1 serving
    expect(screen.getByLabelText('Amount of White rice')).toHaveValue(1);
    expect(screen.getByLabelText('Unit for White rice')).toHaveValue('serving');
  });

  it('sends name, serving, preview nutrition and the recipe, then toasts, saves and closes', async () => {
    const { user, onClose, onSaved } = setup();
    await user.type(screen.getByLabelText(/recipe name/i), '  Chili ');
    await addIngredient(user, 'Chicken breast');
    await addIngredient(user, 'White rice');
    await user.type(screen.getByLabelText(/makes \(servings\)/i), '2');

    await user.click(saveButton());

    await waitFor(() => expect(svc.create).toHaveBeenCalledTimes(1));
    const input = svc.create.mock.calls[0][0];
    expect(input).toMatchObject({ name: 'Chili', serving_size: 1, serving_unit: 'serving' });
    expect(input.nutrition.calories_per_serving).toBe(165); // (200 + 130) / 2
    expect(input.recipe.yield_servings).toBe(2);
    expect(input.recipe.ingredients).toHaveLength(2);
    expect(input.recipe.ingredients[0]).toMatchObject({
      food_item_id: chicken.id, name: 'Chicken breast', amount: 1, unit: 'serving',
      servings: 1, serving_size: 100, serving_unit: 'g',
    });
    expect(input.recipe.ingredients[1].food_item_id).toBe('usda_55');
    expect(input.recipe.ingredients[1].nutrition.carbs_grams).toBe(28);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/saved/i), { tone: 'success' });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the server message and stays open when the save fails', async () => {
    svc.create.mockRejectedValue({ graphQLErrors: [{ message: 'A food with that name already exists' }] });
    const { user, onClose } = setup();
    await user.type(screen.getByLabelText(/recipe name/i), 'Chili');
    await addIngredient(user, 'Chicken breast');
    await user.type(screen.getByLabelText(/makes \(servings\)/i), '2');
    await user.click(saveButton());

    await waitFor(() => expect(notify).toHaveBeenCalledWith('A food with that name already exists', { tone: 'error' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the old unit when the new one cannot convert', async () => {
    const { user } = setup();
    await addIngredient(user, 'Chicken breast');
    const unit = screen.getByLabelText('Unit for Chicken breast');
    // a gram food cannot be measured in cups, so the select never offers it
    expect(within(unit).queryByRole('option', { name: 'cup' })).not.toBeInTheDocument();
    expect(within(unit).getByRole('option', { name: 'lb' })).toBeInTheDocument();
  });
});

describe('recipe builder: paste', () => {
  it('lands parsed rows in the list, flags estimates, unit mismatches and unresolved lines', async () => {
    svc.parseRecipe.mockResolvedValue([
      {
        line: '2 lb ground beef', name: 'Ground beef', food_item_id: 'b'.repeat(24), amount: 2, unit: 'lb',
        servings: 9.07, serving_size: 100, serving_unit: 'g', nutrition: macros(250), estimated: false,
      },
      {
        line: '1 can tomatoes', name: 'Tomatoes', amount: 1, unit: 'can', servings: 1,
        serving_size: 1, serving_unit: 'serving', nutrition: macros(40), estimated: true,
      },
      {
        line: '1 cup flour', name: 'Flour', amount: 1, unit: 'cup', servings: 1,
        serving_size: 100, serving_unit: 'g', nutrition: macros(364), unitMismatch: true,
      },
      { line: 'a pinch of love', name: 'love', unresolved: true },
    ]);
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: /paste ingredients/i }));
    await user.type(screen.getByLabelText(/ingredient list/i), 'whatever');
    await user.click(screen.getByRole('button', { name: /add to recipe/i }));

    expect(svc.parseRecipe).toHaveBeenCalledWith('whatever');
    expect(await screen.findByText('Ground beef')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount of Ground beef')).toHaveValue(2);
    expect(screen.getByLabelText('Unit for Ground beef')).toHaveValue('lb');
    expect(screen.getByText('2,268 cal')).toBeInTheDocument(); // 250 x 9.07
    expect(screen.getAllByText('estimate')).toHaveLength(1);
    expect(screen.getByText(/doesn.t match this food.s serving/i)).toBeInTheDocument();
    expect(screen.getByText(/couldn.t match .a pinch of love./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pick a food/i })).toBeInTheDocument();
  });

  it('says so when the list could not be read', async () => {
    svc.parseRecipe.mockRejectedValue({ response: { data: { error: { message: 'Nothing in that looked like food' } } } });
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /paste ingredients/i }));
    await user.type(screen.getByLabelText(/ingredient list/i), 'zzz');
    await user.click(screen.getByRole('button', { name: /add to recipe/i }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Nothing in that looked like food', { tone: 'error' }));
  });
});

describe('recipe builder: editing', () => {
  it('pre-fills from the saved recipe and updates by id', async () => {
    const food = {
      id: 'c'.repeat(24), name: 'Chili',
      recipe: {
        yield_servings: 6,
        ingredients: [{
          food_item_id: null, name: 'Ground beef', amount: 2, unit: 'lb', servings: 9.07,
          serving_size: 100, serving_unit: 'g', nutrition: macros(250), estimated: false,
        }],
      },
    };
    const { user } = setup({ food });

    expect(screen.getByLabelText(/recipe name/i)).toHaveValue('Chili');
    expect(screen.getByLabelText(/makes \(servings\)/i)).toHaveValue(6);
    expect(screen.getByLabelText('Amount of Ground beef')).toHaveValue(2);
    expect(screen.getByText('378 cal per serving')).toBeInTheDocument(); // 250 x 9.07 / 6

    await user.click(saveButton());
    await waitFor(() => expect(svc.update).toHaveBeenCalledTimes(1));
    expect(svc.update.mock.calls[0][0]).toBe(food.id);
    expect(svc.create).not.toHaveBeenCalled();
  });
});
