// Typing in My Foods' search box crashed the page: the filter called
// `food.source.toLowerCase()` and `source` was never on the wire. Rows are
// built here WITHOUT `source` — the shape the gateway answered with for
// months — so the guard is what's under test, not the new field.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyFoods from '../MyFoods';

const foods = [
  { id: 'a', name: 'Chili', nutrition: { calories_per_serving: 400 } },
  { id: 'b', name: 'Overnight oats', brand: null },
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

describe('My Foods search', () => {
  it('filters rows that carry no source instead of crashing', async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    render(<MyFoods />);

    await user.type(screen.getByPlaceholderText(/search your foods/i), 'oat');

    expect(screen.getByText('Overnight oats')).toBeInTheDocument();
    expect(screen.queryByText('Chili')).not.toBeInTheDocument();
  });

  it('opens the editor for a row with no nutrition', async () => {
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    render(<MyFoods />);

    await user.click(screen.getByRole('button', { name: /edit overnight oats/i }));

    expect(await screen.findByDisplayValue('Overnight oats')).toBeInTheDocument();
  });
});
