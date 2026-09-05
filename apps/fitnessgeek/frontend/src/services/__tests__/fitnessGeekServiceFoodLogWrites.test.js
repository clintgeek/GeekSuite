/**
 * The four food-log writes, on GraphQL.
 *
 * `addFoodToLog` / `updateFoodLog` / `deleteFoodLog` / `addMealToLog` used to
 * POST/PUT/DELETE `/api/logs` and `POST /api/meals/:id/add-to-log` against
 * fitnessgeek's own backend through `restClient`. As of 2026-09-05 they go
 * through `apiService` to basegeek's gateway (`addFoodLog`, `updateFoodLog`,
 * `deleteFoodLog`, `logMeal` — gateway side landed in 79b1b57).
 *
 * The Apollo client is mocked at `@geeksuite/api-client`, so what these tests
 * pin is the *wire contract*: which operation is sent and with which variables.
 * The documents themselves are validated against the gateway's merged typeDefs
 * by a separate static check (see DOCS/SUITE_TODO.md item 2).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mutate = vi.fn();
const query = vi.fn();

vi.mock('@geeksuite/api-client', () => ({
  createApolloClient: () => ({ mutate, query }),
}));

// restClient sets up axios interceptors at import time and would otherwise
// reach for @geeksuite/auth's cookie plumbing; the four writes under test no
// longer use it, and this keeps the module graph honest about that.
vi.mock('../restClient.js', () => ({
  restClient: {
    get: vi.fn(() => Promise.reject(new Error('restClient must not be used by food-log writes'))),
    post: vi.fn(() => Promise.reject(new Error('restClient must not be used by food-log writes'))),
    put: vi.fn(() => Promise.reject(new Error('restClient must not be used by food-log writes'))),
    delete: vi.fn(() => Promise.reject(new Error('restClient must not be used by food-log writes'))),
  },
}));

const { fitnessGeekService } = await import('../fitnessGeekService.js');
const { restClient } = await import('../restClient.js');

/** The operation name off the mocked mutate() call's document. */
const operationName = (call) => call.mutation.definitions[0].name.value;
const lastCall = () => mutate.mock.calls.at(-1)[0];

const NUTRITION = {
  calories_per_serving: 150,
  protein_grams: 5,
  carbs_grams: 27,
  fat_grams: 3,
  fiber_grams: 4,
  sugar_grams: 1,
  sodium_mg: 10,
};

/** A USDA search result, as `foodApiService` shapes one. Synthetic id. */
const searchResult = {
  id: 'usda_169705',
  name: 'Oats, raw',
  brand: 'Quaker',
  barcode: '030000010204',
  nutrition: NUTRITION,
  serving: { size: 40, unit: 'g' },
  source: 'usda',
  source_id: '169705',
  dataType: 'SR Legacy',
};

const OBJECT_ID = '0123456789abcdef01234567';

beforeEach(() => {
  mutate.mockReset();
  query.mockReset();
  restClient.post.mockClear();
  restClient.put.mockClear();
  restClient.delete.mockClear();
});

describe('addFoodToLog', () => {
  it('sends AddFoodLog with the whole food as food_item when the id is not an ObjectId', async () => {
    mutate.mockResolvedValue({ data: { addFoodLog: { id: 'log1' } } });

    await fitnessGeekService.addFoodToLog({
      food_item: searchResult,
      meal_type: 'lunch',
      servings: 1.5,
      log_date: '2026-09-05',
      nutrition: NUTRITION,
    });

    const call = lastCall();
    expect(operationName(call)).toBe('AddFoodLog');
    expect(call.variables.input).toEqual({
      log_date: '2026-09-05',
      meal_type: 'lunch',
      servings: 1.5,
      food_item: {
        id: 'usda_169705',
        name: 'Oats, raw',
        brand: 'Quaker',
        serving_size: 40,
        serving_unit: 'g',
        barcode: '030000010204',
        nutrition: NUTRITION,
        source: 'usda',
        source_id: '169705',
      },
      nutrition: NUTRITION,
    });
    // No food_item_id at all — supplying both is what the gateway calls ambiguous.
    expect(call.variables.input.food_item_id).toBeUndefined();
  });

  it('carries id / source / source_id through so the gateway can dedupe', async () => {
    mutate.mockResolvedValue({ data: { addFoodLog: { id: 'log1' } } });

    await fitnessGeekService.addFoodToLog({
      food_item: searchResult,
      meal_type: 'snack',
      servings: 1,
      log_date: '2026-09-05',
    });

    const { food_item } = lastCall().variables.input;
    expect(food_item.id).toBe('usda_169705');
    expect(food_item.source).toBe('usda');
    expect(food_item.source_id).toBe('169705');
  });

  it('sends food_item_id instead when the food is already a catalog row', async () => {
    mutate.mockResolvedValue({ data: { addFoodLog: { id: 'log1' } } });

    await fitnessGeekService.addFoodToLog({
      food_item: { _id: OBJECT_ID, name: 'Stored food', nutrition: NUTRITION },
      meal_type: 'dinner',
      servings: 2,
      log_date: '2026-09-05',
    });

    const { input } = lastCall().variables;
    expect(input.food_item_id).toBe(OBJECT_ID);
    expect(input.food_item).toBeUndefined();
  });

  it('flattens serving.{size,unit} and defaults them when the food has none', async () => {
    mutate.mockResolvedValue({ data: { addFoodLog: { id: 'log1' } } });

    await fitnessGeekService.addFoodToLog({
      food_item: { id: 'ai_abc', name: 'Bowl of soup', nutrition: { calories_per_serving: 90 } },
      meal_type: 'lunch',
      servings: 1,
      log_date: '2026-09-05',
    });

    const { food_item } = lastCall().variables.input;
    expect(food_item.serving_size).toBe(100);
    expect(food_item.serving_unit).toBe('g');
    // Missing nutrition fields are zero-filled, never undefined — NutritionDataInput
    // takes Floats and REST's findOrCreate did the same `|| 0`.
    expect(food_item.nutrition).toEqual({
      calories_per_serving: 90,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0,
      fiber_grams: 0,
      sugar_grams: 0,
      sodium_mg: 0,
    });
  });

  it('omits the log-level nutrition snapshot when the caller sent none', async () => {
    mutate.mockResolvedValue({ data: { addFoodLog: { id: 'log1' } } });

    await fitnessGeekService.addFoodToLog({
      food_item: searchResult,
      meal_type: 'snack',
      servings: 1,
      log_date: '2026-09-05',
    });

    // Omitting it is what makes the gateway snapshot the food's own nutrition,
    // exactly as REST's `nutrition || foodItem.nutrition`.
    expect(lastCall().variables.input).not.toHaveProperty('nutrition');
  });

  it('folds a Date log_date to the local calendar day', async () => {
    mutate.mockResolvedValue({ data: { addFoodLog: { id: 'log1' } } });

    await fitnessGeekService.addFoodToLog({
      food_item: searchResult,
      meal_type: 'breakfast',
      servings: 1,
      log_date: new Date(2026, 8, 5, 23, 30), // local 2026-09-05, late evening
    });

    expect(lastCall().variables.input.log_date).toBe('2026-09-05');
  });

  it('returns the REST-shaped { success, data, message } envelope', async () => {
    mutate.mockResolvedValue({ data: { addFoodLog: { id: 'log1', servings: 1 } } });

    const result = await fitnessGeekService.addFoodToLog({
      food_item: searchResult,
      meal_type: 'snack',
      servings: 1,
      log_date: '2026-09-05',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 'log1', servings: 1 });
    expect(restClient.post).not.toHaveBeenCalled();
  });
});

describe('updateFoodLog', () => {
  it('sends UpdateFoodLog with only the fields the edit dialog supplied', async () => {
    mutate.mockResolvedValue({ data: { updateFoodLog: { id: 'log1' } } });

    // Exactly what EditLogDialog.handleSave builds.
    await fitnessGeekService.updateFoodLog('log1', {
      servings: 2,
      meal_type: 'dinner',
      notes: 'half portion',
      nutrition: {
        calories_per_serving: 300,
        protein_grams: 10,
        carbs_grams: 54,
        fat_grams: 6,
      },
    });

    const call = lastCall();
    expect(operationName(call)).toBe('UpdateFoodLog');
    expect(call.variables).toEqual({
      id: 'log1',
      input: {
        servings: 2,
        meal_type: 'dinner',
        notes: 'half portion',
        nutrition: {
          calories_per_serving: 300,
          protein_grams: 10,
          carbs_grams: 54,
          fat_grams: 6,
        },
      },
    });
    // No food_item_id: that is what lets a servings edit succeed over a food
    // that has since been soft-deleted.
    expect(call.variables.input).not.toHaveProperty('food_item_id');
    expect(call.variables.input).not.toHaveProperty('log_date');
  });

  it('sends a single field when that is all that changed', async () => {
    mutate.mockResolvedValue({ data: { updateFoodLog: { id: 'log1' } } });

    await fitnessGeekService.updateFoodLog('log1', { servings: 0.5 });

    expect(lastCall().variables.input).toEqual({ servings: 0.5 });
  });

  it('passes log_date and an ObjectId food_item_id through when given', async () => {
    mutate.mockResolvedValue({ data: { updateFoodLog: { id: 'log1' } } });

    await fitnessGeekService.updateFoodLog('log1', {
      log_date: '2026-09-06',
      food_item_id: OBJECT_ID,
    });

    expect(lastCall().variables.input).toEqual({
      log_date: '2026-09-06',
      food_item_id: OBJECT_ID,
    });
  });

  it('returns the REST-shaped envelope and never touches restClient', async () => {
    mutate.mockResolvedValue({ data: { updateFoodLog: { id: 'log1', servings: 2 } } });

    const result = await fitnessGeekService.updateFoodLog('log1', { servings: 2 });

    expect(result).toEqual({
      success: true,
      data: { id: 'log1', servings: 2 },
      message: 'Food log updated successfully',
    });
    expect(restClient.put).not.toHaveBeenCalled();
  });
});

describe('deleteFoodLog', () => {
  it('sends DeleteFoodLog with the log id', async () => {
    mutate.mockResolvedValue({ data: { deleteFoodLog: true } });

    const result = await fitnessGeekService.deleteFoodLog('log1');

    const call = lastCall();
    expect(operationName(call)).toBe('DeleteFoodLog');
    expect(call.variables).toEqual({ id: 'log1' });
    expect(result).toEqual({ success: true, message: 'Food log deleted successfully' });
    expect(restClient.delete).not.toHaveBeenCalled();
  });

  it('throws when the gateway returns false, matching REST’s 404', async () => {
    mutate.mockResolvedValue({ data: { deleteFoodLog: false } });

    await expect(fitnessGeekService.deleteFoodLog('nope')).rejects.toThrow('Food log not found');
  });
});

describe('addMealToLog', () => {
  it('sends LogMeal with mealId, a YYYY-MM-DD date and the meal type', async () => {
    mutate.mockResolvedValue({ data: { logMeal: [{ id: 'a' }, { id: 'b' }] } });

    await fitnessGeekService.addMealToLog('meal1', '2026-09-05', 'dinner');

    const call = lastCall();
    expect(operationName(call)).toBe('LogMeal');
    expect(call.variables).toEqual({
      mealId: 'meal1',
      date: '2026-09-05',
      mealType: 'dinner',
    });
  });

  it('sends a null mealType when the caller omits it', async () => {
    mutate.mockResolvedValue({ data: { logMeal: [] } });

    await fitnessGeekService.addMealToLog('meal1', '2026-09-05');

    expect(lastCall().variables.mealType).toBeNull();
  });

  it('reports how many logs the gateway created', async () => {
    mutate.mockResolvedValue({ data: { logMeal: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } });

    const result = await fitnessGeekService.addMealToLog('meal1', '2026-09-05', 'lunch');

    expect(result.success).toBe(true);
    expect(result.data.logsCreated).toBe(3);
    expect(result.data.logs).toHaveLength(3);
    expect(restClient.post).not.toHaveBeenCalled();
  });

  it('folds a Date to the local calendar day', async () => {
    mutate.mockResolvedValue({ data: { logMeal: [] } });

    await fitnessGeekService.addMealToLog('meal1', new Date(2026, 8, 5, 23, 30), 'snack');

    expect(lastCall().variables.date).toBe('2026-09-05');
  });
});
