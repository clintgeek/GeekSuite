// The Reports CSV export (REST foodReportService) carries sodium and net carbs
// (TRENDS_PLAN D6), with net carbs floored per log as the daily summary does.
// Invented values; the data layer is mocked.
const mod = (p) => new URL(p, import.meta.url).pathname;
import { describe, test, expect, jest } from '@jest/globals';

const LOGS = [
  { log_date: new Date('2026-09-18T00:00:00Z'), meal_type: 'lunch', servings: 2,
    nutrition: { calories_per_serving: 400, protein_grams: 30, carbs_grams: 40, fat_grams: 10, fiber_grams: 10, sugar_grams: 5, sodium_mg: 800 } },
  { log_date: new Date('2026-09-18T00:00:00Z'), meal_type: 'snack', servings: 1,
    nutrition: { calories_per_serving: 100, protein_grams: 2, carbs_grams: 5, fat_grams: 1, fiber_grams: 8, sugar_grams: 1, sodium_mg: 200 } },
];
const chain = (rows) => ({ populate: () => ({ lean: async () => rows }), sort: () => ({ lean: async () => [] }), lean: async () => rows });
jest.unstable_mockModule(mod('../../models/FoodLog.js'), () => ({ __esModule: true, default: { find: () => chain(LOGS) } }));
jest.unstable_mockModule(mod('../../models/Weight.js'), () => ({ __esModule: true, default: { find: () => chain([]) } }));
jest.unstable_mockModule(mod('../../models/NutritionGoals.js'), () => ({ __esModule: true, default: { getActiveGoals: async () => null } }));

const { default: foodReportService } = await import('../../services/foodReportService.js');

describe('CSV export', () => {
  test('has sodium and net-carb columns with per-log-floored net carbs', async () => {
    const csv = await foodReportService.export('u1', { start: '2026-09-18', days: 1 });
    const [header, row] = csv.split('\n');
    expect(header).toBe('Date,Calories,Protein,Carbs,Fat,Fiber,Sugar,Sodium (mg),Net carbs');
    // sodium 800×2 + 200 = 1800; net carbs (40−10)×2 + max(0, 5−8) = 60
    expect(row).toBe('2026-09-18,900,62,85,21,28,11,1800,60');
  });
});
