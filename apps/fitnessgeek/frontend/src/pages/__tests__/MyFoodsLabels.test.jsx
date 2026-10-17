/**
 * My Foods words (UX review V-1 and §2.7):
 *   - the empty state said "…we'll remember it" — the app is "I" or "you",
 *     never "we", and the line now says what to tap;
 *   - "Unknown" (an unknown source) was printed in bold on four rows of
 *     five. An unknown source now says nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ foods: [] }));

vi.mock('../../hooks/useFoodManagement.js', () => ({
  useFoodManagement: () => ({
    foods: state.foods,
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

const { default: MyFoods } = await import('../MyFoods.jsx');

describe('My Foods words', () => {
  it('an empty library says what shows up here and what to tap', () => {
    state.foods = [];
    render(<MyFoods />);
    expect(screen.getByText('Foods you create, and foods you log often, show up here. + New food makes one now.')).toBeInTheDocument();
    expect(screen.queryByText(/we'll/i)).toBeNull();
  });

  it('hides an unknown source, and still names a known one', () => {
    state.foods = [
      { id: 'a', name: 'Chili', source: 'unknown', nutrition: { calories_per_serving: 400 } },
      { id: 'b', name: 'Overnight oats', nutrition: { calories_per_serving: 300 } },
      { id: 'c', name: 'Banana', source: 'usda', nutrition: { calories_per_serving: 105 } },
    ];
    render(<MyFoods />);
    expect(screen.getByText('Chili')).toBeInTheDocument();
    expect(screen.queryByText(/^unknown$/i)).toBeNull();
    expect(screen.getByText('USDA')).toBeInTheDocument();
  });
});
