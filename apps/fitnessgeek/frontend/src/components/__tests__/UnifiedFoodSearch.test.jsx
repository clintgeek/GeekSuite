/**
 * The search box: two waves, no submit step, one tap to log.
 *
 * What these pin down is the behaviour the old box got wrong. It searched only
 * on Enter or a send arrow, so nothing happened while you typed; and logging a
 * food meant staging it and then pressing commit. See
 * apps/fitnessgeek/DOCS/THE_FOOD_SEARCH_PLAN.md.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';
import UnifiedFoodSearch from '../FoodSearch/UnifiedFoodSearch.jsx';

const suggest = vi.fn();
const search = vi.fn();

vi.mock('../../services/foodService', () => ({
  foodService: {
    suggest: (...args) => suggest(...args),
    search: (...args) => search(...args)
  }
}));

const food = (name, overrides = {}) => ({
  id: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  source: 'usda',
  nutrition: { calories_per_serving: 200, protein_grams: 6, carbs_grams: 30, fat_grams: 8 },
  ...overrides
});

const renderBox = (props = {}) =>
  render(
    <GeekToastProvider>
      <UnifiedFoodSearch onLogItems={vi.fn()} {...props} />
    </GeekToastProvider>
  );

const type = (value) =>
  fireEvent.change(screen.getByPlaceholderText(/search foods/i), { target: { value } });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  suggest.mockResolvedValue([]);
  search.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('typing, not submitting', () => {
  it('asks the local catalog shortly after you stop typing — no button press', async () => {
    renderBox();
    type('pancakes');

    expect(suggest).not.toHaveBeenCalled();   // not on the keystroke itself
    await vi.advanceTimersByTimeAsync(200);

    expect(suggest).toHaveBeenCalledWith('pancakes', expect.objectContaining({ limit: 15 }));
    // The slow wave has NOT gone yet — the local answer paints first.
    expect(search).not.toHaveBeenCalled();
  });

  it('follows up with the food databases on a longer pause', async () => {
    renderBox();
    type('pancakes');
    await vi.advanceTimersByTimeAsync(500);

    expect(search).toHaveBeenCalledWith('pancakes', expect.objectContaining({ limit: 25 }));
  });

  it('does not reach the databases for a one-character query', async () => {
    renderBox();
    type('p');
    await vi.advanceTimersByTimeAsync(600);

    expect(search).not.toHaveBeenCalled();
  });

  it('shows local results before the databases answer', async () => {
    suggest.mockResolvedValue([food('My Pancakes', { source: 'custom' })]);
    search.mockImplementation(() => new Promise(() => {}));   // never settles

    renderBox();
    type('pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText('My Pancakes')).toBeInTheDocument();
  });

  it('appends database results to what is already on screen', async () => {
    suggest.mockResolvedValue([food('My Pancakes', { source: 'custom' })]);
    search.mockResolvedValue([food('Pancakes, chocolate chip')]);

    renderBox();
    type('pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText('My Pancakes')).toBeInTheDocument();
    expect(await screen.findByText('Pancakes, chocolate chip')).toBeInTheDocument();
  });
});

describe('one tap logs it', () => {
  it('logs the tapped food with its serving, and does not ask again', async () => {
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['log-1'] });
    suggest.mockResolvedValue([food('Pancakes', { requestedQuantity: 4 })]);

    renderBox({ onLogItems, mealType: 'breakfast' });
    type('pancakes');
    await vi.advanceTimersByTimeAsync(200);

    fireEvent.click(await screen.findByText('Pancakes'));

    await waitFor(() => expect(onLogItems).toHaveBeenCalledTimes(1));
    const [items, meal] = onLogItems.mock.calls[0];
    expect(items[0]).toMatchObject({ name: 'Pancakes', servings: 4 });
    expect(meal).toBe('breakfast');
  });

  it('offers an undo that deletes exactly what it wrote', async () => {
    const onLogItems = vi.fn().mockResolvedValue({ ok: 1, fail: 0, logIds: ['log-1'] });
    const onUndo = vi.fn().mockResolvedValue();
    suggest.mockResolvedValue([food('Pancakes')]);

    renderBox({ onLogItems, onUndo });
    type('pancakes');
    await vi.advanceTimersByTimeAsync(200);
    fireEvent.click(await screen.findByText('Pancakes'));

    fireEvent.click(await screen.findByRole('button', { name: /undo/i }));
    await waitFor(() => expect(onUndo).toHaveBeenCalledWith(['log-1']));
  });
});

describe('dead ends', () => {
  it('always offers to create what you typed', async () => {
    const onCreateFood = vi.fn();
    renderBox({ onCreateFood });
    type('goat cheese crostini');
    await vi.advanceTimersByTimeAsync(600);

    fireEvent.click(await screen.findByText(/goat cheese crostini/i, { selector: 'strong' }));
    expect(onCreateFood).toHaveBeenCalledWith('goat cheese crostini');
  });

  it('says so when the backend fell back to ingredients', async () => {
    search.mockResolvedValue([
      food('Chocolate chips', { compositeItem: 'chocolate chip', decomposedFrom: 'chocolate chip pancakes' })
    ]);

    renderBox();
    type('chocolate chip pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText(/showing its parts instead/i)).toBeInTheDocument();
  });

  it('keeps your own foods listed when the databases fail', async () => {
    suggest.mockResolvedValue([food('My Pancakes', { source: 'custom' })]);
    search.mockRejectedValue(new Error('USDA is down'));

    renderBox();
    type('pancakes');
    await vi.advanceTimersByTimeAsync(600);

    expect(await screen.findByText('My Pancakes')).toBeInTheDocument();
  });
});
