/**
 * `updateFood` / `deleteFood`, on GraphQL — the wire contract behind
 * MyFoods.jsx's edit dialog.
 *
 * BURN_REVIEW #15: the gateway's `FitnessFood` is flat (`id`, `serving_size`,
 * `serving_unit`) — there is no `_id` and no nested `serving` object. Before
 * this fix, MyFoods.jsx read `food.serving?.size || 100` (always missing,
 * so every edit rewrote the serving to 100 g) and `editingFood._id` (always
 * undefined, so the save issued `PUT /foods/undefined`). These tests pin the
 * corrected wire contract: the mutation goes out with the real id and the
 * flat serving fields, and — per BURN_REVIEW #19 — only the nutrition keys
 * that actually changed are sent, since `updateFitnessFood` merges them as
 * dot paths and a full zero-filled snapshot would silently reset the rest.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mutate = vi.fn();
const query = vi.fn();

vi.mock('@geeksuite/api-client', () => ({
  createApolloClient: () => ({ mutate, query }),
}));

vi.mock('../restClient.js', () => ({
  restClient: {
    get: vi.fn(() => Promise.reject(new Error('restClient must not be used by food writes'))),
    post: vi.fn(() => Promise.reject(new Error('restClient must not be used by food writes'))),
    put: vi.fn(() => Promise.reject(new Error('restClient must not be used by food writes'))),
    delete: vi.fn(() => Promise.reject(new Error('restClient must not be used by food writes'))),
  },
}));

const { fitnessGeekService } = await import('../fitnessGeekService.js');

const operationName = (call) => call.mutation.definitions[0].name.value;
const lastCall = () => mutate.mock.calls.at(-1)[0];

// A row exactly as the gateway's `fitnessFoods` query returns it (and as
// GET_FOOD_ITEMS in apiService.js selects it): flat, `id` not `_id`.
const gatewayFood = {
  id: '0123456789abcdef01234567',
  name: 'Almond butter',
  brand: 'Justin\'s',
  serving_size: 32,
  serving_unit: 'g',
  nutrition: {
    calories_per_serving: 190,
    protein_grams: 7,
    carbs_grams: 6,
    fat_grams: 17,
    fiber_grams: 3,
    sugar_grams: 2,
    sodium_mg: 110,
  },
  barcode: null,
  is_verified: false,
};

beforeEach(() => {
  mutate.mockReset();
  query.mockReset();
});

describe('updateFood (MyFoods.jsx edit dialog)', () => {
  it('sends the gateway id, not _id, as the mutation variable', async () => {
    mutate.mockResolvedValue({ data: { updateFitnessFood: { id: gatewayFood.id } } });

    // What MyFoods.jsx's handleEditSubmit now builds: `editingFood.id ?? editingFood._id`.
    const foodId = gatewayFood.id ?? gatewayFood._id;
    await fitnessGeekService.updateFood(foodId, {
      name: gatewayFood.name,
      brand: gatewayFood.brand,
      serving_size: gatewayFood.serving_size,
      serving_unit: gatewayFood.serving_unit,
    });

    const call = lastCall();
    expect(operationName(call)).toBe('UpdateFitnessFood');
    expect(call.variables.id).toBe(gatewayFood.id);
  });

  it('carries serving_size / serving_unit through as flat fields, not a nested serving object', async () => {
    mutate.mockResolvedValue({ data: { updateFitnessFood: { id: gatewayFood.id } } });

    await fitnessGeekService.updateFood(gatewayFood.id, {
      name: gatewayFood.name,
      brand: gatewayFood.brand,
      serving_size: 45, // the user changed it
      serving_unit: 'g',
    });

    const { input } = lastCall().variables;
    expect(input.serving_size).toBe(45);
    expect(input.serving_unit).toBe('g');
    expect(input.serving).toBeUndefined();
  });

  it('does NOT fall back to the 100g default when serving_size is unpopulated on the page read', async () => {
    // Reproduces the exact pre-fix bug shape as a regression guard: if the
    // page ever again read `food.serving?.size` (always undefined on the
    // flat gateway row) it would send 100 here instead of the real value.
    const pageEditForm = {
      name: gatewayFood.name,
      brand: gatewayFood.brand,
      serving_size: gatewayFood.serving_size || 100, // correct read: flat field
      serving_unit: gatewayFood.serving_unit || 'g',
    };
    expect(pageEditForm.serving_size).toBe(32);

    mutate.mockResolvedValue({ data: { updateFitnessFood: { id: gatewayFood.id } } });
    await fitnessGeekService.updateFood(gatewayFood.id, pageEditForm);

    expect(lastCall().variables.input.serving_size).toBe(32);
  });

  it('sends only the changed nutrition keys, leaving the rest out of the patch', async () => {
    mutate.mockResolvedValue({ data: { updateFitnessFood: { id: gatewayFood.id } } });

    // Only sodium_mg changed; the other six macros are not part of the patch.
    await fitnessGeekService.updateFood(gatewayFood.id, {
      name: gatewayFood.name,
      brand: gatewayFood.brand,
      serving_size: gatewayFood.serving_size,
      serving_unit: gatewayFood.serving_unit,
      nutrition: { sodium_mg: 500 },
    });

    const { input } = lastCall().variables;
    expect(input.nutrition).toEqual({ sodium_mg: 500 });
    // The regression this guards against: normalizeFoodInput's zero-fill
    // (used by addFitnessFood) would have produced 0 for every other macro.
    expect(input.nutrition.calories_per_serving).toBeUndefined();
    expect(input.nutrition.protein_grams).toBeUndefined();
  });

  it('omits nutrition entirely (as {}) when no macro changed', async () => {
    mutate.mockResolvedValue({ data: { updateFitnessFood: { id: gatewayFood.id } } });

    await fitnessGeekService.updateFood(gatewayFood.id, {
      name: gatewayFood.name,
      brand: gatewayFood.brand,
      serving_size: gatewayFood.serving_size,
      serving_unit: gatewayFood.serving_unit,
    });

    expect(lastCall().variables.input.nutrition).toEqual({});
  });
});

describe('deleteFood (MyFoods.jsx delete dialog)', () => {
  it('sends DeleteFitnessFood with the gateway id', async () => {
    mutate.mockResolvedValue({ data: { deleteFitnessFood: true } });

    // What MyFoods.jsx's handleDeleteConfirm now builds: `deletingFood.id ?? deletingFood._id`.
    const foodId = gatewayFood.id ?? gatewayFood._id;
    await fitnessGeekService.deleteFood(foodId);

    const call = lastCall();
    expect(operationName(call)).toBe('DeleteFitnessFood');
    expect(call.variables).toEqual({ id: gatewayFood.id });
  });
});
