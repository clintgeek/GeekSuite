// FitnessGeek fixtures. Every network call the app makes goes through
// /graphql (apiService rewrites its REST-looking calls into named Apollo
// operations) plus the shared session routes, so nearly everything below is
// keyed by GraphQL operation name.
import { sessionRoutes, graphqlRoute } from '../../lib/net.mjs';

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); };
const TODAY = iso(today);

const nut = (cal, p, c, f, fib = 2) => ({
  __typename: 'Nutrition',
  calories_per_serving: cal, protein_grams: p, carbs_grams: c, fat_grams: f,
  fiber_grams: fib, sugar_grams: 3, sodium_mg: 180,
});

const foodLog = (id, name, brand, meal, servings, n) => ({
  __typename: 'FoodLog',
  id, log_date: TODAY, meal_type: meal, servings, notes: null,
  nutrition: n, calculatedNutrition: n,
  food_item_id: {
    __typename: 'FitnessFood',
    id: `f-${id}`, name, brand, serving_size: 100, serving_unit: 'g', barcode: null,
  },
});

export const FOOD_LOGS = [
  foodLog('l1', 'Greek Yogurt, Plain Whole Milk', 'Fage', 'breakfast', 1, nut(190, 18, 8, 10, 0)),
  foodLog('l2', 'Blueberries', null, 'breakfast', 0.5, nut(42, 0.5, 11, 0.2, 1.8)),
  foodLog('l3', 'Chicken Caesar Salad', "Chef's kitchen", 'lunch', 1, nut(480, 38, 12, 31, 3)),
  foodLog('l4', 'Sourdough Toast', 'Boudin', 'lunch', 2, nut(120, 4, 22, 1, 1)),
  foodLog('l5', 'Ribeye, grilled', null, 'dinner', 1.5, nut(310, 26, 0, 23, 0)),
  foodLog('l6', 'Roasted Brussels Sprouts', null, 'dinner', 1, nut(120, 4, 12, 7, 5)),
  foodLog('l7', 'Almonds', 'Blue Diamond', 'snack', 1, nut(164, 6, 6, 14, 3.5)),
];

export const SETTINGS = {
  __typename: 'FitnessUserSettings',
  id: 'us1', theme: 'dark', influxEnabled: false,
  dashboard: {
    __typename: 'DashboardSettings',
    show_current_weight: true, show_blood_pressure: true, show_calories_today: true,
    show_login_streak: true, show_nutrition_today: true, show_garmin_summary: true,
    show_quick_actions: true, show_weight_goal: true, show_nutrition_goal: true,
    card_order: ['calories', 'nutrition', 'weight', 'bp'],
  },
  garmin: { __typename: 'GarminSettings', enabled: true, username: 'chef', last_connected_at: daysAgo(1) },
  healthBaselines: { __typename: 'HealthBaselines', weeklyHRV: 62, restingHR: 54, lastUpdated: daysAgo(1) },
  notifications: { __typename: 'NotificationSettings', enabled: true, daily_reminder: true, goal_reminders: true },
  nutrition_goal: {
    __typename: 'NutritionGoal',
    enabled: true, start_date: daysAgo(120), start_weight: 232, target_weight: 195,
    activity_level: 'moderate', weight_change_rate: 1, plan_type: 'standard',
    calorie_target_mode: 'auto', auto_base_calories: 2100, fixed_calories: null,
    activity_eatback_fraction: 0.5, activity_eatback_cap_kcal: 400,
    protein_g_per_lb_goal: 0.8, fat_g_per_lb_goal: 0.4, goal_weight_lbs: 195,
    show_adjustment: true, daily_calorie_target: 2100,
    weekly_schedule: [2100, 2100, 2100, 2100, 2100, 2400, 2400],
    min_safe_calories: 1500, bmr: 1980, tdee: 2600, timeline_weeks: 37,
    estimated_end_date: '2026-12-01', mode: 'standard',
    keto: {
      __typename: 'KetoSettings', net_carb_limit_g: 20, track_net_carbs: true,
      macro_split: { __typename: 'MacroSplit', preset: 'balanced', fat_pct: 40, protein_pct: 30, carb_pct: 30 },
    },
  },
  weight_goal: {
    __typename: 'WeightGoal',
    enabled: true, startWeight: 232, targetWeight: 195, startDate: daysAgo(120),
    goalDate: '2026-12-01', ratePerWeek: 1, lastRecalculated: daysAgo(7), unit: 'lbs', is_active: true,
  },
  units: { __typename: 'Units', weight: 'lbs', height: 'in' },
  ai: {
    __typename: 'AiSettings', enabled: true,
    features: {
      __typename: 'AiFeatures', natural_language_food_logging: true, meal_suggestions: true,
      nutrition_analysis: true, goal_recommendations: true,
    },
  },
  household: {
    __typename: 'Household', household_id: 'h1', display_name: 'Chef',
    share_food_logs: true, share_weight: false, share_meals: true,
  },
  favorite_foods: [
    { __typename: 'FitnessFood', id: 'f-fav1', name: 'Greek Yogurt', brand: 'Fage' },
    { __typename: 'FitnessFood', id: 'f-fav2', name: 'Ribeye', brand: null },
  ],
};

export const WEIGHTS = Array.from({ length: 24 }, (_, i) => {
  const n = 23 - i;
  return {
    __typename: 'FitnessWeight',
    id: `w${i}`,
    weight_value: Math.round((232 - (23 - n) * 0.55 + Math.sin(i) * 0.8) * 10) / 10,
    log_date: daysAgo(n * 3),
    notes: null,
    formatted_date: daysAgo(n * 3),
  };
}).reverse();

export const BPS = Array.from({ length: 14 }, (_, i) => ({
  __typename: 'BloodPressure',
  id: `bp${i}`,
  systolic: 118 + ((i * 5) % 17),
  diastolic: 74 + ((i * 3) % 11),
  pulse: 62 + ((i * 2) % 9),
  log_date: daysAgo(i * 2),
  notes: null,
}));

export const DERIVED = {
  __typename: 'DerivedMacros',
  todayIndex: (today.getDay() + 6) % 7,
  calories: { __typename: 'DerivedCalories', daily: 2100, weekly_schedule: [2100, 2100, 2100, 2100, 2100, 2400, 2400] },
  fixed: { __typename: 'DerivedFixed', protein_g: 156, fat_g: 78, protein_kcal: 624, fat_kcal: 702 },
  rules: {
    __typename: 'DerivedRules', goal_weight_lbs: 195, protein_g_per_lb: 0.8, fat_g_per_lb: 0.4,
    calorie_target_mode: 'auto', activity_eatback_fraction: 0.5, activity_eatback_cap_kcal: 400,
  },
  today: {
    __typename: 'DerivedDay', dayIndex: (today.getDay() + 6) % 7, base_calories: 2100,
    activity_add_kcal: 240, target_calories: 2340, protein_g: 156, fat_g: 78, carbs_g: 148,
  },
  weekly: Array.from({ length: 7 }, (_, i) => ({
    __typename: 'DerivedDay', dayIndex: i, base_calories: 2100, activity_add_kcal: 200,
    target_calories: 2300, protein_g: 156, fat_g: 78, carbs_g: 145,
  })),
};

const totals = FOOD_LOGS.reduce((acc, l) => {
  const s = l.servings;
  acc.calories += l.nutrition.calories_per_serving * s;
  acc.protein_grams += l.nutrition.protein_grams * s;
  acc.carbs_grams += l.nutrition.carbs_grams * s;
  acc.fat_grams += l.nutrition.fat_grams * s;
  acc.fiber_grams += l.nutrition.fiber_grams * s;
  return acc;
}, { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0, fiber_grams: 0 });

export const DAILY_SUMMARY = {
  __typename: 'DailySummary',
  date: TODAY,
  calorieGoal: 2340,
  totals: {
    __typename: 'NutritionTotals',
    calories: Math.round(totals.calories), protein_grams: Math.round(totals.protein_grams),
    carbs_grams: Math.round(totals.carbs_grams), fat_grams: Math.round(totals.fat_grams),
    fiber_grams: Math.round(totals.fiber_grams), net_carbs_grams: Math.round(totals.carbs_grams - totals.fiber_grams),
    sugar_grams: 21, sodium_mg: 1980,
  },
  meals: {
    __typename: 'MealTotals',
    breakfast: { __typename: 'MealTotal', calories: 211, protein_grams: 18, carbs_grams: 14, fat_grams: 10 },
    lunch: { __typename: 'MealTotal', calories: 720, protein_grams: 46, carbs_grams: 56, fat_grams: 33 },
    dinner: { __typename: 'MealTotal', calories: 585, protein_grams: 43, carbs_grams: 12, fat_grams: 42 },
    snack: { __typename: 'MealTotal', calories: 164, protein_grams: 6, carbs_grams: 6, fat_grams: 14 },
  },
};

export const FOODS = [
  { __typename: 'FitnessFood', id: 'f1', name: 'Greek Yogurt, Plain Whole Milk', brand: 'Fage', serving_size: 170, serving_unit: 'g', nutrition: nut(190, 18, 8, 10, 0), barcode: '0891234500017', is_verified: true },
  { __typename: 'FitnessFood', id: 'f2', name: 'Ribeye Steak, grilled', brand: null, serving_size: 113, serving_unit: 'g', nutrition: nut(310, 26, 0, 23, 0), barcode: null, is_verified: true },
  { __typename: 'FitnessFood', id: 'f3', name: 'Almonds, raw', brand: 'Blue Diamond', serving_size: 28, serving_unit: 'g', nutrition: nut(164, 6, 6, 14, 3.5), barcode: '0410000010101', is_verified: false },
  { __typename: 'FitnessFood', id: 'f4', name: 'Sourdough Bread', brand: 'Boudin', serving_size: 50, serving_unit: 'g', nutrition: nut(120, 4, 22, 1, 1), barcode: null, is_verified: false },
];

export const OPS = {
  GetFitnessUserSettings: { fitnessUserSettings: SETTINGS },
  UpdateFitnessUserSettings: { updateFitnessUserSettings: { __typename: 'FitnessUserSettings', id: 'us1', theme: 'dark' } },
  GetFoodLogs: { foodLogs: FOOD_LOGS },
  GetFitnessWeights: { fitnessWeights: WEIGHTS },
  GetBps: { bloodPressures: BPS },
  GetDerivedMacros: { derivedMacros: DERIVED },
  GetDailySummary: { dailySummary: DAILY_SUMMARY },
  GetWeeklySummary: { weeklySummary: {} },
  GetActiveNutritionGoals: { activeNutritionGoals: null },
  GetFitnessFoods: { fitnessFoods: FOODS },
  GetFitnessFood: { fitnessFood: FOODS[0] },
  GetFitnessMeals: { fitnessMeals: [] },
  GetFitnessMedications: { fitnessMedications: [] },
  GetLoginStreak: { loginStreak: { __typename: 'LoginStreak', current_streak: 12, longest_streak: 31, last_login: TODAY } },
  // The dashboard records a login on mount; without this the harness logs an
  // unstubbed op on every run.
  RecordLoginStreak: { recordLoginStreak: { __typename: 'LoginStreak', current_streak: 12, longest_streak: 31, last_login: TODAY } },
  GetFitnessHousehold: {
    fitnessHousehold: {
      __typename: 'Household', household_id: 'h1', display_name: 'Chef',
      share_food_logs: true, share_weight: false, share_meals: true,
      members: [
        { __typename: 'HouseholdMember', user_id: 'u2', display_name: 'Sarah', shares_food_logs: true, shares_meals: true },
      ],
    },
  },
  GetHouseholdMemberLogs: { fitnessHouseholdMemberLogs: FOOD_LOGS.slice(0, 3) },
  GetGarminStatus: { garminStatus: { __typename: 'GarminStatus', connected: true, last_sync: daysAgo(0) } },
  GetGarminDaily: {
    garminDaily: {
      __typename: 'GarminDaily', date: TODAY, steps: 8421, calories: 2632, activeCalories: 512,
      restingHeartRate: 54, distance: 6.1, floors: 12, intensityMinutes: 44,
    },
  },
  GetGarminSleep: { garminSleep: null },
  GetGarminActivities: { garminActivities: [] },
  GetMorningBrief: { fitnessInsightsMorningBrief: null },
  GetDailyInsightSummary: { fitnessInsightsDailySummary: null },
  GetCorrelations: { fitnessInsightsCorrelations: null },
  GetWeeklyInsightReport: { fitnessInsightsWeeklyReport: null },
  GetTrendWatch: { fitnessInsightsTrendWatch: null },
  GetCoaching: { fitnessInsightsCoaching: null },
  GetAiContext: { fitnessInsightsContext: null },
};

export async function routes(ctx, { base, scheme, viewport } = {}) {
  await sessionRoutes(ctx);
  await graphqlRoute(ctx, OPS);
}
