/**
 * EditLogDialog feeds NutritionInputs from PER-SERVING numbers, but the
 * field was labelled just "Calories" — while two sections down the same
 * dialog shows "Nutrition for {servings} servings: {total}". Someone who
 * remembers "that was 440 total" could type 440 into a field labelled
 * "Calories" with 2 servings selected and silently double the real total to
 * 880 on save, with nothing on screen contradicting them at the point of
 * entry.
 *
 * `NutritionInputs` has exactly one caller (grepped repo-wide before this
 * fix), so the qualifier is added generically but only exercised here —
 * a bare `<NutritionInputs />` with no `qualifier` prop must keep reading
 * exactly "Calories", so a future second caller isn't surprised.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import NutritionInputs from '../NutritionInputs.jsx';
import EditLogDialog from '../EditLogDialog.jsx';

const theme = createTheme();
const withTheme = (children) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

describe('NutritionInputs label qualifier', () => {
  it('defaults to plain "Calories" when no caller asks for a qualifier', () => {
    render(withTheme(<NutritionInputs values={{}} onChange={vi.fn()} />));
    expect(screen.getByLabelText('Calories')).toBeInTheDocument();
  });

  it('appends the qualifier a caller passes', () => {
    render(withTheme(<NutritionInputs values={{}} onChange={vi.fn()} qualifier=" (per serving)" />));
    expect(screen.getByLabelText('Calories (per serving)')).toBeInTheDocument();
  });
});

describe('EditLogDialog disambiguates the per-serving fields', () => {
  const LOG = {
    id: 'log1',
    servings: 2,
    meal_type: 'dinner',
    log_date: '2026-10-15T00:00:00.000Z',
    food_item: { name: 'Lasagna', nutrition: { calories_per_serving: 440, protein_grams: 20, carbs_grams: 30, fat_grams: 15 } }
  };

  it('labels the calorie field "per serving", distinct from the total shown below', () => {
    render(
      withTheme(
        <EditLogDialog open onClose={vi.fn()} onSave={vi.fn()} log={LOG} />
      )
    );
    // The entry's total comes first; the per-serving fields sit behind a disclosure.
    expect(screen.getByLabelText('Calories')).toHaveValue('880');
    expect(screen.queryByLabelText('Calories (per serving)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));

    // The per-serving input, explicitly qualified...
    expect(screen.getByLabelText('Calories (per serving)')).toBeInTheDocument();
    // ...distinct from the servings-aware total preview elsewhere in the
    // dialog, which is what someone remembering "that was 440 total" needs
    // to notice disagrees with a bare "Calories" field.
    expect(screen.getByText(/Nutrition for 2 servings/i)).toBeInTheDocument();
  });
});

/**
 * REVIEW_2026-10 Phase 2.12 + CONTRACTS C3: a described entry is an estimate,
 * and "1.5 servings of a bowl of soup" is not a question anyone can answer —
 * so the calories themselves are editable, and an entry can move to another
 * day. Only what changed goes out, as the gateway's per-serving overrides.
 */

describe('EditLogDialog: calories, macros and the day', () => {
  const SOUP = {
    id: 'log-soup',
    servings: 1,
    meal_type: 'lunch',
    log_date: '2026-10-15T00:00:00.000Z',
    nutrition: { calories_per_serving: 220, protein_grams: 10, carbs_grams: 20, fat_grams: 8, fiber_grams: 2 },
    food_item_id: { id: 'f1', name: 'Chicken soup' }
  };
  const open = (log) => {
    const onSave = vi.fn();
    render(withTheme(
      <EditLogDialog open onClose={vi.fn()} onSave={onSave} log={log} />
    ));
    return onSave;
  };
  // Everything the total hides sits behind one disclosure, closed.
  const openDetail = () => fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  const save = () => fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

  it('asks for one Calories number for the whole entry first, sent as the per-serving override', () => {
    const onSave = open({ ...SOUP, servings: 2 });
    const calories = screen.getByLabelText('Calories');
    expect(calories).toHaveValue('440');
    expect(calories).toHaveAttribute('inputmode', 'decimal');
    expect(screen.queryByLabelText(/protein/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'More options' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(calories, { target: { value: '300' } });
    save();
    const [id, patch] = onSave.mock.calls[0];
    expect(id).toBe('log-soup');
    expect(patch.calories).toBe(150);
    expect(patch).not.toHaveProperty('nutrition');
    expect(patch).not.toHaveProperty('log_date');
  });

  it('nothing changed sends no override', () => {
    const onSave = open(SOUP);
    save();
    expect(onSave.mock.calls[0][1]).not.toHaveProperty('calories');
  });

  it('opening the disclosure and saving untouched sends no override either', () => {
    const onSave = open(SOUP);
    openDetail();
    save();
    const patch = onSave.mock.calls[0][1];
    for (const key of ['calories', 'protein_grams', 'carbs_grams', 'fat_grams']) expect(patch).not.toHaveProperty(key);
  });

  it('a macro edit in the disclosure sends only that macro', () => {
    const onSave = open(SOUP);
    openDetail();
    fireEvent.change(screen.getByLabelText('Protein (per serving)'), { target: { value: '25' } });
    save();
    const patch = onSave.mock.calls[0][1];
    expect(patch.protein_grams).toBe(25);
    expect(patch).not.toHaveProperty('calories');
    expect(patch).not.toHaveProperty('carbs_grams');
  });

  it('per-serving calories in the disclosure go out as the per-serving override, and the total follows', () => {
    const onSave = open({ ...SOUP, servings: 2 });
    openDetail();
    fireEvent.change(screen.getByLabelText('Calories (per serving)'), { target: { value: '250' } });
    expect(screen.getByLabelText('Calories')).toHaveValue('500');
    expect(screen.getByText('500 cal')).toBeInTheDocument();
    save();
    const patch = onSave.mock.calls[0][1];
    expect(patch.calories).toBe(250);
    expect(patch).not.toHaveProperty('protein_grams');
  });

  it('typing the total after the disclosure still sends the total as a per-serving number', () => {
    const onSave = open({ ...SOUP, servings: 2 });
    openDetail();
    fireEvent.change(screen.getByLabelText('Calories (per serving)'), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '300' } });
    expect(screen.getByLabelText('Calories (per serving)')).toHaveValue(150);
    save();
    expect(onSave.mock.calls[0][1].calories).toBe(150);
  });

  it('moves the entry to another day', () => {
    const onSave = open(SOUP);
    // Day is behind "More options": the dialog opens on calories, servings, meal.
    expect(screen.queryByLabelText('Day')).toBeNull();
    expect(screen.queryByLabelText('Notes (optional)')).toBeNull();
    openDetail();
    const dayField = screen.getByLabelText('Day');
    expect(dayField).toHaveValue('2026-10-15');
    fireEvent.change(dayField, { target: { value: '2026-10-14' } });
    save();
    expect(onSave.mock.calls[0][1].log_date).toBe('2026-10-14');
  });

  it('will not save a calorie number past what the server allows', () => {
    const onSave = open(SOUP);
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '25000' } });
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    save();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('the servings box brings up the decimal keypad and takes "0.5"', () => {
    const onSave = open(SOUP);
    const box = screen.getByRole('textbox', { name: 'Servings' });
    expect(box).toHaveAttribute('inputmode', 'decimal');
    fireEvent.change(box, { target: { value: '0.' } });
    expect(box).toHaveValue('0.');
    fireEvent.change(box, { target: { value: '0.5' } });
    save();
    expect(onSave.mock.calls[0][1].servings).toBe(0.5);
  });
});

/**
 * UX review L9 and L15: Save at the bottom on a phone, labelled "Save" (not
 * "Save Changes"); and "Remove" inside the dialog, since the rows lost
 * their trash icon.
 */
describe('EditLogDialog: Save under the thumb, Remove inside', () => {
  const EGG = {
    id: 'log-egg',
    servings: 1,
    meal_type: 'breakfast',
    log_date: '2026-10-15',
    nutrition: { calories_per_serving: 78, protein_grams: 6, carbs_grams: 1, fat_grams: 5 },
    food_item_id: { id: 'f2', name: 'Egg' }
  };
  const originalMatchMedia = window.matchMedia;
  afterEach(() => { window.matchMedia = originalMatchMedia; });

  it('on a phone, Save is the one full-width button at the bottom', () => {
    window.matchMedia = (query) => ({
      matches: true, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    });
    render(withTheme(
      <EditLogDialog open onClose={vi.fn()} onSave={vi.fn()} log={EGG} />
    ));
    const bottom = screen.getByTestId('thumb-save');
    expect(within(bottom).getByRole('button', { name: /^save$/i, hidden: true })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^save$/i, hidden: true })).toHaveLength(1);
  });

  it('Remove hands the entry back to the page', () => {
    const onRemove = vi.fn();
    render(withTheme(
      <EditLogDialog open onClose={vi.fn()} onSave={vi.fn()} onRemove={onRemove} log={EGG} />
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Egg' }));
    expect(onRemove).toHaveBeenCalledWith('log-egg');
  });
});

/**
 * Review 2026-11-27 (scenes 50c, 50d): a slider for servings beside a
 * Servings box, under a Calories box, with nothing saying which drove which.
 * Servings is the serving sheet's − / + now, and each field says its part.
 */
describe('EditLogDialog: servings is a stepper, and says how it relates to calories', () => {
  const EGG = {
    id: 'log-egg',
    servings: 2,
    meal_type: 'breakfast',
    log_date: '2026-11-27T00:00:00.000Z',
    nutrition: { calories_per_serving: 78, protein_grams: 6, carbs_grams: 1, fat_grams: 5 },
    food_item_id: { id: 'egg', name: 'EGG, LARGE' }
  };
  const open = () => {
    const onSave = vi.fn();
    render(withTheme(<EditLogDialog open onClose={vi.fn()} onSave={onSave} log={EGG} />));
    return onSave;
  };

  it('has no slider; one Servings box between − and +', () => {
    open();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getAllByLabelText('Servings')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Fewer servings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More servings' })).toBeInTheDocument();
  });

  it('+ and − move a quarter serving and the calories move with them', () => {
    const onSave = open();
    expect(screen.getByLabelText('Calories')).toHaveValue('156');
    fireEvent.click(screen.getByRole('button', { name: 'More servings' }));
    expect(screen.getByLabelText('Servings')).toHaveValue('2.25');
    expect(screen.getByLabelText('Calories')).toHaveValue('176');
    for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Fewer servings' }));
    expect(screen.getByLabelText('Servings')).toHaveValue('1');
    expect(screen.getByLabelText('Calories')).toHaveValue('78');
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    // Servings changed; the per-serving calories did not, so no override.
    expect(onSave.mock.calls[0][1].servings).toBe(1);
    expect(onSave.mock.calls[0][1]).not.toHaveProperty('calories');
  });

  it('− stops at a quarter serving', () => {
    open();
    for (let i = 0; i < 12; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Fewer servings' }));
    expect(screen.getByLabelText('Servings')).toHaveValue('0.25');
    expect(screen.getByRole('button', { name: 'Fewer servings' })).toBeDisabled();
  });

  it('typing the calories is "I know the total": servings stay, and the per-serving override goes out', () => {
    const onSave = open();
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '200' } });
    expect(screen.getByLabelText('Servings')).toHaveValue('2');
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onSave.mock.calls[0][1]).toMatchObject({ servings: 2, calories: 100 });
  });

  it('says the relationship in one line each', () => {
    open();
    expect(screen.getByText('The total for this entry. Type it here if you know it.')).toBeInTheDocument();
    expect(screen.getByTestId('edit-log-servings-help')).toHaveTextContent('More or fewer servings changes the calories above.');
  });

  it('draws a shouted name in title case', () => {
    open();
    expect(screen.getByRole('heading', { name: 'Egg, Large' })).toBeInTheDocument();
  });
});
