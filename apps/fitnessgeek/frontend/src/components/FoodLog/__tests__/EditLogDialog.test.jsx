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
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
