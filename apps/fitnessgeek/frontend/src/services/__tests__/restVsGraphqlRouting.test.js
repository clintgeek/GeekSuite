/**
 * Four calls that were pointed at the wrong transport, and one operation that
 * asked for a field the schema has no argument for.
 *
 * `apps/fitnessgeek/DOCS/CONTEXT.md` ("Frontend — where the writes go") states
 * the rule: domain data goes to basegeek's `/graphql`; only what the gateway
 * has no equivalent for stays on this app's REST backend. Each of these broke
 * it in one direction or the other, and each failure was silent to the user:
 *
 *  1. `getFoodByBarcode` went through the GraphQL router. `fitnessFoods` takes
 *     only `search`, so the barcode was dropped and the query answered with the
 *     UNFILTERED catalog — BarcodeScanner then took `[0]` and reported an
 *     arbitrary food as the scan result, for every scan.
 *  2. `BloodPressure`'s heart-rate series and
 *  3. `reportsService.export`'s CSV both went through the GraphQL router, which
 *     has no mapping for their paths at all — every call threw
 *     "Rest proxy gap", showing as an empty chart and "Failed to export report".
 *  4. `PUT /settings/dashboard` and `/settings/ai` handed the gateway the
 *     SUB-DOCUMENT as the whole `FitnessUserSettingsInput`, which is an input
 *     coercion error: the save could never succeed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const query = vi.fn(() => Promise.resolve({ data: {} }));
const mutate = vi.fn(() => Promise.resolve({ data: {} }));

vi.mock('@geeksuite/api-client', () => ({
  createApolloClient: () => ({ query, mutate }),
}));

vi.mock('../restClient.js', () => ({
  restClient: {
    get: vi.fn(() => Promise.resolve({ data: { success: true, data: [] } })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

const { restClient } = await import('../restClient.js');
const { fitnessGeekService } = await import('../fitnessGeekService.js');
const { reportsService } = await import('../reportsService.js');
const { apiService } = await import('../apiService.js');

const operationName = (call) => call.mutation.definitions[0].name.value;

beforeEach(() => {
  query.mockClear();
  mutate.mockClear();
  restClient.get.mockClear();
  restClient.get.mockResolvedValue({ data: { success: true, data: [] } });
});

describe('getFoodByBarcode', () => {
  it('asks REST for the barcode, never the search-only GraphQL query', async () => {
    restClient.get.mockResolvedValue({
      data: { success: true, data: [{ id: 'f1', name: 'Oat Milk', barcode: '01234567890' }] },
    });

    const food = await fitnessGeekService.getFoodByBarcode('01234567890');

    expect(query).not.toHaveBeenCalled();
    expect(restClient.get).toHaveBeenCalledWith('/foods', { params: { barcode: '01234567890' } });
    expect(food).toMatchObject({ id: 'f1', name: 'Oat Milk' });
  });

  it('answers null when nothing matches, rather than the first food in the catalog', async () => {
    restClient.get.mockResolvedValue({ data: { success: true, data: [] } });
    await expect(fitnessGeekService.getFoodByBarcode('99999999')).resolves.toBeNull();
  });
});

describe('the Garmin heart-rate series', () => {
  it('goes to REST — the GraphQL router has no mapping for it', async () => {
    restClient.get.mockResolvedValue({ data: { success: true, data: { series: [{ time: 1, bpm: 60 }] } } });

    const data = await fitnessGeekService.getGarminHeartRate('2026-02-26');

    expect(restClient.get).toHaveBeenCalledWith('/fitness/garmin/heart-rate/2026-02-26');
    expect(data.series).toHaveLength(1);
  });

  it('the same path through the GraphQL router is still an unmapped-route error', async () => {
    // Guards the fix from being undone by "simplifying" the call back onto
    // apiService: that is exactly what made the chart permanently empty.
    await expect(apiService.get('/fitness/garmin/heart-rate/2026-02-26')).rejects.toThrow(/Rest proxy gap/);
  });
});

describe('the food-report CSV export', () => {
  it('goes to REST as a blob', async () => {
    const blob = { size: 12 };
    restClient.get.mockResolvedValue({ data: blob });

    const result = await reportsService.export({ days: 30 });

    expect(restClient.get).toHaveBeenCalledWith(
      '/food-reports/export?format=csv&days=30',
      { responseType: 'blob' }
    );
    expect(result).toBe(blob);
  });

  it('the overview and trends reads stay on GraphQL', async () => {
    await reportsService.getOverview({ days: 7 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].query.definitions[0].name.value).toBe('GetFoodReportOverview');
  });
});

describe('the settings sub-document routes', () => {
  it('PUT /settings/dashboard nests the body under `dashboard`', async () => {
    await apiService.put('/settings/dashboard', { show_current_weight: false, card_order: ['a'] });

    expect(mutate).toHaveBeenCalledTimes(1);
    const call = mutate.mock.calls[0][0];
    expect(operationName(call)).toBe('UpdateFitnessUserSettings');
    expect(call.variables.input).toEqual({
      dashboard: { show_current_weight: false, card_order: ['a'] },
    });
  });

  it('PUT /settings/ai nests the body under `ai`', async () => {
    await apiService.put('/settings/ai', { enabled: false, features: { meal_suggestions: true } });

    const call = mutate.mock.calls[0][0];
    expect(call.variables.input).toEqual({
      ai: { enabled: false, features: { meal_suggestions: true } },
    });
  });

  it('PUT /settings itself is still passed through whole', async () => {
    await apiService.put('/settings', { theme: 'dark', dashboard: { show_current_weight: true } });

    const call = mutate.mock.calls[0][0];
    expect(call.variables.input).toEqual({
      theme: 'dark',
      dashboard: { show_current_weight: true },
    });
  });
});

describe('the medication mutations return the whole row', () => {
  it('addFitnessMedication selects more than `id`', async () => {
    await apiService.post('/meds', { display_name: 'Lisinopril' });

    const call = mutate.mock.calls[0][0];
    const selections = call.mutation.definitions[0].selectionSet.selections[0]
      .selectionSet.selections.map((s) => s.name.value);
    expect(selections).toContain('id');
    expect(selections).toContain('display_name');
    expect(selections).toContain('times_of_day');
  });

  it('updateFitnessMedication selects the same set', async () => {
    await apiService.put('/meds/m1', { display_name: 'Lisinopril' });

    const call = mutate.mock.calls[0][0];
    const selections = call.mutation.definitions[0].selectionSet.selections[0]
      .selectionSet.selections.map((s) => s.name.value);
    expect(selections).toContain('display_name');
    expect(selections).toContain('med_type');
  });
});
