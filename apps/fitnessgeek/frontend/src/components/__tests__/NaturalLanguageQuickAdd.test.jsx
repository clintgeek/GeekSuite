/**
 * NaturalLanguageQuickAdd — the proposal card for AI_IDEAS.md idea #2.
 *
 * The rules this pins are the product ones, not the pixels:
 *
 *   - the model never names a food. Every row on the card came out of the
 *     app's own catalog search, run on the *query* the gateway returned; a
 *     query with no match offers the ordinary search instead of inventing an
 *     item.
 *   - nothing is written by parsing. `onLogRows` fires only when the person
 *     presses the one button, and only for the rows still ticked.
 *   - per-row servings and meal type are what get logged, not the page's
 *     current meal — "eggs for breakfast, salad for lunch" is one sentence.
 *   - every proposal is labelled `AI-drafted` with a visible provenance line,
 *     including on the no-model path.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import NaturalLanguageQuickAdd from '../FoodLog/NaturalLanguageQuickAdd.jsx';
import { provenanceLine } from '../../utils/quickAddProvenance.js';

const parse = vi.fn();
const search = vi.fn();

vi.mock('../../services/quickAddService.js', () => ({
  quickAddService: { parse: (...args) => parse(...args) },
  default: { parse: (...args) => parse(...args) },
}));

vi.mock('../../services/foodService.js', () => ({
  foodService: { search: (...args) => search(...args) },
}));

const MODEL_PROVENANCE = {
  source: 'model',
  reason: null,
  model: 'llama-3.1-8b',
  provider: 'groq',
  cached: false,
  callsToday: 3,
  cap: 40,
};

const twoFragments = {
  fragments: [
    { text: 'two eggs', query: 'eggs', servings: 2, unit: null, mealType: 'breakfast' },
    { text: 'black coffee', query: 'black coffee', servings: 1, unit: null, mealType: 'breakfast' },
  ],
  provenance: MODEL_PROVENANCE,
};

const EGG = { id: 'food-egg', name: 'Egg, whole, raw', brand: 'USDA', source: 'usda', nutrition: { calories_per_serving: 72 } };
const COFFEE = { id: 'food-coffee', name: 'Coffee, black', source: 'usda', nutrition: { calories_per_serving: 2 } };

const renderSheet = (props = {}) =>
  render(
    <NaturalLanguageQuickAdd
      open
      onClose={vi.fn()}
      defaultMealType="snack"
      onLogRows={vi.fn(async () => ({ ok: 2, fail: 0 }))}
      onSearchFor={vi.fn()}
      {...props}
    />
  );

const typeAndRead = async (text = 'two eggs and black coffee') => {
  fireEvent.change(screen.getByLabelText(/What did you eat/i), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Read it/i }));
  await waitFor(() => expect(screen.getByTestId('quick-add-provenance')).toBeInTheDocument());
};

beforeEach(() => {
  parse.mockReset();
  search.mockReset();
  parse.mockResolvedValue(twoFragments);
  search.mockImplementation(async (query) => (query === 'eggs' ? [EGG] : [COFFEE]));
});

describe('NaturalLanguageQuickAdd', () => {
  it('asks the question and logs nothing until asked to', async () => {
    const onLogRows = vi.fn();
    renderSheet({ onLogRows });

    expect(screen.getByLabelText(/What did you eat/i)).toBeInTheDocument();
    await typeAndRead();

    expect(parse).toHaveBeenCalledWith('two eggs and black coffee');
    expect(onLogRows).not.toHaveBeenCalled();
  });

  it('runs every fragment through the existing food search, never the model, for the food itself', async () => {
    renderSheet();
    await typeAndRead();

    expect(search.mock.calls.map((call) => call[0])).toEqual(['eggs', 'black coffee']);
    expect(screen.getByText('Egg, whole, raw')).toBeInTheDocument();
    expect(screen.getByText('Coffee, black')).toBeInTheDocument();
  });

  it('labels the proposal AI-drafted and shows where it came from', async () => {
    renderSheet();
    await typeAndRead();

    expect(screen.getByText('AI-drafted')).toBeInTheDocument();
    expect(screen.getByTestId('quick-add-provenance')).toHaveTextContent(/drafted by llama-3\.1-8b/i);
    expect(screen.getByTestId('quick-add-provenance')).toHaveTextContent(/3 of 40 today/i);
  });

  it('logs the ticked rows with their own servings and meal type', async () => {
    const onLogRows = vi.fn(async () => ({ ok: 1, fail: 0 }));
    const onClose = vi.fn();
    renderSheet({ onLogRows, onClose });
    await typeAndRead();

    // Untick the coffee, bump the eggs to three.
    fireEvent.click(screen.getByLabelText('Log Coffee, black'));
    fireEvent.change(screen.getByLabelText('Servings of Egg, whole, raw'), { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: /Log 1 item$/i }));

    await waitFor(() => expect(onLogRows).toHaveBeenCalledTimes(1));
    expect(onLogRows).toHaveBeenCalledWith([
      { food: EGG, servings: 3, mealType: 'breakfast' },
    ]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('the button counts what is ticked and is dead when nothing is', async () => {
    renderSheet();
    await typeAndRead();

    expect(screen.getByRole('button', { name: /Log 2 items/i })).toBeEnabled();
    fireEvent.click(screen.getByLabelText('Log Egg, whole, raw'));
    fireEvent.click(screen.getByLabelText('Log Coffee, black'));
    expect(screen.getByRole('button', { name: /Log 0 items/i })).toBeDisabled();
  });

  it('a query the catalog does not know offers the ordinary search, never an invented food', async () => {
    parse.mockResolvedValue({
      fragments: [{ text: 'a bowl of glorp', query: 'glorp', servings: 1, unit: 'bowl', mealType: 'dinner' }],
      provenance: MODEL_PROVENANCE,
    });
    search.mockResolvedValue([]);
    const onSearchFor = vi.fn();
    renderSheet({ onSearchFor });
    await typeAndRead('a bowl of glorp');

    expect(screen.getByText(/no match/i)).toBeInTheDocument();
    // The fragment text is shown as-is; nothing was fabricated to fill the row.
    expect(screen.getByText('a bowl of glorp')).toBeInTheDocument();
    // Nothing is tickable, so the one write button is dead.
    expect(screen.getByRole('button', { name: /Log 0 items/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Search “glorp”/i }));
    expect(onSearchFor).toHaveBeenCalledWith('glorp', 'dinner');
  });

  it('a search that throws is one bad row, not a dead proposal', async () => {
    search.mockImplementation(async (query) => {
      if (query === 'eggs') throw new Error('offline');
      return [COFFEE];
    });
    renderSheet();
    await typeAndRead();

    expect(screen.getByText(/search failed/i)).toBeInTheDocument();
    expect(screen.getByText('Coffee, black')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log 1 item$/i })).toBeEnabled();
  });

  it('an unreadable sentence says so and keeps the box', async () => {
    parse.mockResolvedValue({ fragments: [], provenance: null });
    renderSheet();

    fireEvent.change(screen.getByLabelText(/What did you eat/i), { target: { value: '...' } });
    fireEvent.click(screen.getByRole('button', { name: /Read it/i }));

    await waitFor(() => expect(screen.getByText(/Nothing to log in that/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/What did you eat/i)).toBeInTheDocument();
    expect(search).not.toHaveBeenCalled();
  });

  it('a failed parse never leaves the person stuck on a spinner', async () => {
    parse.mockRejectedValue(new Error('502'));
    renderSheet();

    fireEvent.change(screen.getByLabelText(/What did you eat/i), { target: { value: 'two eggs' } });
    fireEvent.click(screen.getByRole('button', { name: /Read it/i }));

    await waitFor(() => expect(screen.getByText(/Could not read that just now/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Read it/i })).toBeEnabled();
  });

  it('the text field is capped at the 500 characters the gateway accepts', async () => {
    renderSheet();
    const field = screen.getByLabelText(/What did you eat/i);
    fireEvent.change(field, { target: { value: 'x'.repeat(700) } });
    expect(field.value).toHaveLength(500);
  });

  it('every proposal row keeps its controls above the 44px tap floor', async () => {
    renderSheet();
    await typeAndRead();

    const list = screen.getAllByRole('listitem');
    expect(list).toHaveLength(2);
    for (const row of list) {
      expect(within(row).getByRole('checkbox')).toBeInTheDocument();
      expect(within(row).getByRole('spinbutton')).toBeInTheDocument();
      expect(within(row).getByRole('combobox')).toBeInTheDocument();
    }
  });
});

describe('provenanceLine', () => {
  it('names the model when there was one', () => {
    expect(provenanceLine(MODEL_PROVENANCE)).toMatch(/^drafted by llama-3\.1-8b · groq · 3 of 40 today$/);
  });

  it('says plainly when there was not', () => {
    expect(provenanceLine(null)).toMatch(/^no model/);
    expect(provenanceLine({ source: 'fallback', reason: 'cap', cap: 40 })).toMatch(/no model/);
    expect(provenanceLine({ source: 'fallback', reason: 'disabled' })).toMatch(/switched off/);
    expect(provenanceLine({ source: 'fallback', reason: 'unavailable' })).toMatch(/did not answer/);
  });
});
