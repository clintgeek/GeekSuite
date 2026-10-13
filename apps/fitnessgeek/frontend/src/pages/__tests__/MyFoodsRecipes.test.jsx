import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyFoods from '../MyFoods';

const macros = (cal) => ({ calories_per_serving: cal, protein_grams: 10, carbs_grams: 20, fat_grams: 5 });

const foods = [
  {
    id: 'r1', name: 'Sunday chili', source: 'custom', serving_size: 1, serving_unit: 'serving',
    nutrition: macros(410),
    recipe: {
      yield_servings: 6,
      ingredients: [{
        name: 'Ground beef', amount: 2, unit: 'lb', servings: 9, serving_size: 100, serving_unit: 'g',
        nutrition: macros(250),
      }],
    },
  },
  { id: 'f1', name: 'Almond butter', source: 'custom', serving_size: 32, serving_unit: 'g', nutrition: macros(190), recipe: null },
];

vi.mock('../../hooks/useFoodManagement.js', () => ({
  useFoodManagement: () => ({
    foods,
    loading: false,
    error: '',
    successMessage: '',
    loadFoods: vi.fn(),
    updateFood: vi.fn(),
    deleteFood: vi.fn(),
    clearError: vi.fn(),
    clearSuccess: vi.fn(),
  }),
}));

vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
}));

describe('My Foods recipes', () => {
  it('labels a recipe row with Recipe and its serving count, and not a plain food', () => {
    render(<MyFoods />);
    expect(screen.getByText('Recipe')).toBeInTheDocument();
    expect(screen.getByText('makes 6')).toBeInTheDocument();
    expect(screen.getAllByText('Recipe')).toHaveLength(1);
  });

  it('opens the builder pre-filled when editing a recipe, and the plain form for a food', async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    render(<MyFoods />);

    await user.click(screen.getByRole('button', { name: /edit sunday chili/i }));
    expect(await screen.findByLabelText(/makes \(servings\)/i)).toHaveValue(6);
    expect(screen.getByLabelText(/recipe name/i)).toHaveValue('Sunday chili');
    expect(screen.getByLabelText('Amount of Ground beef')).toHaveValue(2);
  });

  it('opens the plain food form for a non-recipe', async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    render(<MyFoods />);

    await user.click(screen.getByRole('button', { name: /edit almond butter/i }));
    expect(await screen.findByDisplayValue('Almond butter')).toBeInTheDocument();
    expect(screen.queryByLabelText(/makes \(servings\)/i)).not.toBeInTheDocument();
  });

  it('offers New recipe and New food', async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    render(<MyFoods />);

    await user.click(screen.getByRole('button', { name: /new recipe/i }));
    expect(await screen.findByLabelText(/recipe name/i)).toHaveValue('');
  });

  it('New food opens the custom-food form', async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    render(<MyFoods />);

    await user.click(screen.getByRole('button', { name: /new food/i }));
    expect(await screen.findByText('Create a food')).toBeInTheDocument();
  });
});
