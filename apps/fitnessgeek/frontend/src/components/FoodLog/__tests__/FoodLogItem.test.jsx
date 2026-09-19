/**
 * The favourite star on a logged item used to be structurally unable to
 * agree with reality:
 *
 *   - `isFavorite` defaulted to `false` and nothing ever passed real data in
 *     (MealSection rendered this component with no favourite prop at all),
 *     so every star rendered unfavourited regardless of truth.
 *   - Even once a caller DOES pass real data, `useState(initialFavorite)`
 *     only reads that prop on the first render — favourites load
 *     asynchronously (a separate request from the logs themselves), so the
 *     real value routinely arrives after this component has already
 *     committed `false` to state, and would stay wrong forever without a
 *     sync effect.
 *   - Tapping always called `addFavorite`, never `removeFavorite`, because
 *     the always-false local state made "already a favourite" unreachable.
 *
 * Decision (see FoodLog.jsx/useFoodLog.js): real favourite state is now
 * wired through rather than removing the star, because a repo-wide grep
 * found this is the ONLY interactive favourite toggle anywhere in the
 * frontend — foodService.addFavorite/removeFavorite/getFavorites have no
 * other caller. Removing it would delete the app's only working "favourite
 * this" control, not just a broken display.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import FoodLogItem from '../FoodLogItem.jsx';

vi.mock('../../../services/foodService.js', () => ({
  foodService: {
    addFavorite: vi.fn().mockResolvedValue({}),
    removeFavorite: vi.fn().mockResolvedValue({})
  }
}));

const { foodService } = await import('../../../services/foodService.js');

const theme = createTheme();
const renderItem = (props) =>
  render(
    <ThemeProvider theme={theme}>
      <FoodLogItem {...props} />
    </ThemeProvider>
  );

const LOG = {
  id: 'log1',
  servings: 1,
  food_item: {
    _id: 'f1',
    name: 'Eggs',
    nutrition: { calories_per_serving: 140, protein_grams: 12, carbs_grams: 1, fat_grams: 10 }
  }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('favourite state reflects the real prop, not a stuck default', () => {
  it('renders unfavourited when the caller has not resolved favourites yet', () => {
    renderItem({ log: LOG, isFavorite: false });
    expect(screen.getByRole('button', { name: /add to favorites/i })).toBeInTheDocument();
  });

  it('updates the star when the real favourite data arrives after mount', () => {
    // Mirrors the real sequence: FoodLogItem mounts with `isFavorite={false}`
    // before useFoodLog's favourites fetch resolves, then re-renders once it
    // does. Without the sync effect this stayed stuck on the first value.
    const { rerender } = renderItem({ log: LOG, isFavorite: false });
    expect(screen.getByRole('button', { name: /add to favorites/i })).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={theme}>
        <FoodLogItem log={LOG} isFavorite={true} />
      </ThemeProvider>
    );

    expect(screen.getByRole('button', { name: /remove from favorites/i })).toBeInTheDocument();
  });

  it('tapping an already-favourited item removes it, not adds it again', async () => {
    renderItem({ log: LOG, isFavorite: true });

    fireEvent.click(screen.getByRole('button', { name: /remove from favorites/i }));

    await waitFor(() => expect(foodService.removeFavorite).toHaveBeenCalledWith('f1'));
    expect(foodService.addFavorite).not.toHaveBeenCalled();
  });

  it('tapping an unfavourited item adds it, not removes it', async () => {
    renderItem({ log: LOG, isFavorite: false });

    fireEvent.click(screen.getByRole('button', { name: /add to favorites/i }));

    await waitFor(() => expect(foodService.addFavorite).toHaveBeenCalledWith('f1'));
    expect(foodService.removeFavorite).not.toHaveBeenCalled();
  });
});
