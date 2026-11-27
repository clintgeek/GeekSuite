/**
 * Saved foods > Foods must survive bad data and a failed read.
 *
 * A `null` row threw in the search filter and in the row itself, taking the
 * page to the error boundary; and a first read that failed drew "No foods
 * yet" under an error toast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MyFoods from '../MyFoods';

let hook;
const loadFoods = vi.fn();
vi.mock('../../hooks/useFoodManagement.js', () => ({ useFoodManagement: () => hook }));
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
}));

const base = (over = {}) => ({
  foods: [],
  loading: false,
  error: '',
  successMessage: '',
  loadFoods,
  updateFood: vi.fn(),
  deleteFood: vi.fn(),
  clearError: vi.fn(),
  clearSuccess: vi.fn(),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('My foods: bad records', () => {
  it('draws the good rows when the list holds a null and partial foods', () => {
    hook = base({ foods: [
      null,
      { id: 'a', name: 'Chili', brand: 'Home', nutrition: { calories_per_serving: 400, protein_grams: 30 } },
      { id: 'b' },
      { id: 'c', name: 'No numbers', nutrition: null },
      undefined,
    ] });
    render(<MyFoods embedded />);
    expect(screen.getByText('Chili')).toBeInTheDocument();
    expect(screen.getByText('Unnamed food')).toBeInTheDocument();
    expect(screen.getByText('No numbers')).toBeInTheDocument();
    expect(screen.getAllByTestId('saved-food-row')).toHaveLength(3);
    expect(screen.getByText('3 foods')).toBeInTheDocument();
    // Searching and opening the editor on a bare row must not throw.
    fireEvent.change(screen.getByLabelText('Search your foods'), { target: { value: 'chi' } });
    expect(screen.getAllByTestId('saved-food-row')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search your foods'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Unnamed food' }));
    expect(screen.getByText('Edit food')).toBeInTheDocument();
  });

  it('a list that is not a list is an empty library, not a crash', () => {
    hook = base({ foods: null });
    render(<MyFoods embedded />);
    expect(screen.getByText('No foods yet')).toBeInTheDocument();
  });
});

describe('My foods: the states of the read', () => {
  it('a failed first read says so and offers Try again; it is not "No foods yet"', () => {
    hook = base({ error: 'Couldn’t load your foods. Try again.' });
    render(<MyFoods embedded />);
    expect(screen.getByText('Couldn’t load your foods')).toBeInTheDocument();
    expect(screen.queryByText('No foods yet')).toBeNull();
    const before = loadFoods.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(loadFoods.mock.calls.length).toBe(before + 1);
  });

  it('loading shows a skeleton in the list, with New food still there', () => {
    hook = base({ loading: true });
    render(<MyFoods embedded />);
    expect(screen.queryByText('No foods yet')).toBeNull();
    expect(screen.getByRole('button', { name: /new food/i })).toBeInTheDocument();
  });

  it('has no card title repeating the tab', () => {
    hook = base({ foods: [{ id: 'a', name: 'Chili' }] });
    render(<MyFoods embedded />);
    expect(screen.queryByText('Your foods')).toBeNull();
    expect(screen.getByText('1 food')).toBeInTheDocument();
  });
});

describe('New food', () => {
  it('Save waits for a name', () => {
    hook = base();
    render(<MyFoods embedded />);
    fireEvent.click(screen.getByRole('button', { name: /new food/i }));
    const save = screen.getByRole('button', { name: 'Save food' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Granola' } });
    expect(save).toBeEnabled();
  });
});
