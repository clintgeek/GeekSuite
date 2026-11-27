// The favorite star used to sit on every food row. The rows are tap-to-edit
// now (ONE_APP_PLAN.md), so the edit dialog holds it: it reads whether the
// food is a favorite when it opens, and toggles it itself.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../../services/foodService.js', () => ({
  foodService: {
    getFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
  },
}));

import { foodService } from '../../../services/foodService.js';
import EditLogDialog from '../EditLogDialog.jsx';

const LOG = {
  id: 'log-1',
  servings: 1,
  meal_type: 'lunch',
  log_date: '2026-10-15T00:00:00.000Z',
  nutrition: { calories_per_serving: 220 },
  food_item_id: { id: 'f1', name: 'Chicken soup' },
};

const open = (log = LOG) => render(
  <ThemeProvider theme={createTheme()}>
    <EditLogDialog open onClose={vi.fn()} onSave={vi.fn()} onRemove={vi.fn()} log={log} />
  </ThemeProvider>
);
const star = () => screen.getByTestId('edit-log-favorite');

beforeEach(() => {
  vi.clearAllMocks();
  foodService.addFavorite.mockResolvedValue({});
  foodService.removeFavorite.mockResolvedValue({});
});

describe('EditLogDialog: the favorite star', () => {
  it('waits for the read, then offers to add a food that is not a favorite', async () => {
    let answer;
    foodService.getFavorites.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    open();
    expect(star()).toBeDisabled();
    answer([{ id: 'other' }]);
    await waitFor(() => expect(star()).toBeEnabled());
    expect(star()).toHaveTextContent('Add to favorites');
    expect(star()).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(star());
    await waitFor(() => expect(foodService.addFavorite).toHaveBeenCalledWith('f1'));
    expect(star()).toHaveTextContent('In your favorites');
    expect(star()).toHaveAttribute('aria-pressed', 'true');
    expect(foodService.removeFavorite).not.toHaveBeenCalled();
  });

  it('a food that already is a favorite is removed, never added again', async () => {
    foodService.getFavorites.mockResolvedValue([{ _id: 'f1' }]);
    open();
    await waitFor(() => expect(star()).toHaveTextContent('In your favorites'));
    fireEvent.click(star());
    await waitFor(() => expect(foodService.removeFavorite).toHaveBeenCalledWith('f1'));
    expect(foodService.addFavorite).not.toHaveBeenCalled();
    expect(star()).toHaveTextContent('Add to favorites');
  });

  it('a failed toggle puts the star back and says so', async () => {
    foodService.getFavorites.mockResolvedValue([]);
    foodService.addFavorite.mockRejectedValue(new Error('500'));
    open();
    await waitFor(() => expect(star()).toBeEnabled());
    fireEvent.click(star());
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t change that just now');
    expect(star()).toHaveTextContent('Add to favorites');
  });

  it('stays off when the favorites could not be read', async () => {
    foodService.getFavorites.mockRejectedValue(new Error('offline'));
    open();
    await waitFor(() => expect(foodService.getFavorites).toHaveBeenCalled());
    expect(star()).toBeDisabled();
  });

  it('is not drawn for an entry with no food behind it', () => {
    foodService.getFavorites.mockResolvedValue([]);
    open({ ...LOG, food_item_id: null });
    expect(screen.queryByTestId('edit-log-favorite')).toBeNull();
  });
});
