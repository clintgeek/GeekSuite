import { describe, it, expect } from 'vitest';
import { EMPTY_FOOD_FORM, foodPayloadFromForm } from '../foodForm.js';

describe('foodPayloadFromForm', () => {
  it('sends fiber, sugar and sodium when they were typed (they used to be dropped)', () => {
    const payload = foodPayloadFromForm({
      ...EMPTY_FOOD_FORM, name: '  Granola ', brand: ' Home ',
      calories_per_serving: 210, protein_grams: 5, carbs_grams: 30, fat_grams: 8,
      fiber_grams: 4, sugar_grams: 9, sodium_mg: 120, serving_size: 2, serving_unit: 'oz',
    });
    expect(payload).toEqual({
      name: 'Granola',
      brand: 'Home',
      nutrition: { calories_per_serving: 210, protein_grams: 5, carbs_grams: 30, fat_grams: 8, fiber_grams: 4, sugar_grams: 9, sodium_mg: 120 },
      serving: { size: 2, unit: 'oz' },
    });
  });

  it('a blank form is zeros and one serving, with nothing extra', () => {
    expect(foodPayloadFromForm({ ...EMPTY_FOOD_FORM, name: 'Water' })).toEqual({
      name: 'Water',
      brand: undefined,
      nutrition: { calories_per_serving: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 },
      serving: { size: 1, unit: 'oz' },
    });
  });

  it('survives no form at all', () => {
    expect(foodPayloadFromForm().name).toBe('');
  });
});
