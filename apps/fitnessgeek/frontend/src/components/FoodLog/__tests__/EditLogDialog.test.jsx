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
import { render, screen, within } from '@testing-library/react';
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
    food_item: { name: 'Lasagna', nutrition: { calories_per_serving: 440, protein_grams: 20, carbs_grams: 30, fat_grams: 15 } }
  };

  it('labels the calorie field "per serving", distinct from the total shown below', () => {
    render(
      withTheme(
        <EditLogDialog open onClose={vi.fn()} onSave={vi.fn()} log={LOG} />
      )
    );

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
import { fireEvent } from '@testing-library/react';
import { ExperienceContext } from '../../../contexts/ExperienceContext.jsx';

describe('EditLogDialog: calories, macros and the day', () => {
  const SOUP = {
    id: 'log-soup',
    servings: 1,
    meal_type: 'lunch',
    log_date: '2026-10-15T00:00:00.000Z',
    nutrition: { calories_per_serving: 220, protein_grams: 10, carbs_grams: 20, fat_grams: 8, fiber_grams: 2 },
    food_item_id: { id: 'f1', name: 'Chicken soup' }
  };
  const open = (log, { simple }) => {
    const onSave = vi.fn();
    render(withTheme(
      <ExperienceContext.Provider value={{ isSimple: simple }}>
        <EditLogDialog open onClose={vi.fn()} onSave={onSave} log={log} />
      </ExperienceContext.Provider>
    ));
    return onSave;
  };
  const save = () => fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

  it('Simple: one Calories number for the whole entry, sent as the per-serving override', () => {
    const onSave = open({ ...SOUP, servings: 2 }, { simple: true });
    const calories = screen.getByLabelText('Calories');
    expect(calories).toHaveValue('440');
    expect(calories).toHaveAttribute('inputmode', 'decimal');
    expect(screen.queryByLabelText(/protein/i)).toBeNull();

    fireEvent.change(calories, { target: { value: '300' } });
    save();
    const [id, patch] = onSave.mock.calls[0];
    expect(id).toBe('log-soup');
    expect(patch.calories).toBe(150);
    expect(patch).not.toHaveProperty('nutrition');
    expect(patch).not.toHaveProperty('log_date');
  });

  it('Simple: nothing changed sends no override', () => {
    const onSave = open(SOUP, { simple: true });
    save();
    expect(onSave.mock.calls[0][1]).not.toHaveProperty('calories');
  });

  it('Full: a macro edit sends only that macro', () => {
    const onSave = open(SOUP, { simple: false });
    fireEvent.change(screen.getByLabelText('Protein (per serving)'), { target: { value: '25' } });
    save();
    const patch = onSave.mock.calls[0][1];
    expect(patch.protein_grams).toBe(25);
    expect(patch).not.toHaveProperty('calories');
    expect(patch).not.toHaveProperty('carbs_grams');
  });

  it('moves the entry to another day', () => {
    const onSave = open(SOUP, { simple: true });
    const dayField = screen.getByLabelText('Day');
    expect(dayField).toHaveValue('2026-10-15');
    fireEvent.change(dayField, { target: { value: '2026-10-14' } });
    save();
    expect(onSave.mock.calls[0][1].log_date).toBe('2026-10-14');
  });

  it('will not save a calorie number past what the server allows', () => {
    const onSave = open(SOUP, { simple: true });
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '25000' } });
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
    save();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('the servings box brings up the decimal keypad and takes "0.5"', () => {
    const onSave = open(SOUP, { simple: false });
    const box = screen.getByLabelText('Servings');
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
 * "Save Changes"); and "Remove" inside the dialog, since Simple's rows lost
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
      <ExperienceContext.Provider value={{ isSimple: true }}>
        <EditLogDialog open onClose={vi.fn()} onSave={vi.fn()} log={EGG} />
      </ExperienceContext.Provider>
    ));
    const bottom = screen.getByTestId('thumb-save');
    expect(within(bottom).getByRole('button', { name: /^save$/i, hidden: true })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^save$/i, hidden: true })).toHaveLength(1);
  });

  it('Remove hands the entry back to the page', () => {
    const onRemove = vi.fn();
    render(withTheme(
      <ExperienceContext.Provider value={{ isSimple: true }}>
        <EditLogDialog open onClose={vi.fn()} onSave={vi.fn()} onRemove={onRemove} log={EGG} />
      </ExperienceContext.Provider>
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Egg' }));
    expect(onRemove).toHaveBeenCalledWith('log-egg');
  });
});
