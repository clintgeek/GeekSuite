// FitnessGeek fixtures. Every network call the app makes goes through
// /graphql (apiService rewrites its REST-looking calls into named Apollo
// operations) plus the shared session routes, so nearly everything below is
// keyed by GraphQL operation name.
import { sessionRoutes, graphqlRoute, json } from '../../lib/net.mjs';

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
      // Off by default (R124 flipped the shared factory default to `false`;
      // this feature is now the opt-in AND the kill switch — see
      // `apps/fitnessgeek/frontend/src/utils/quickAddPreference.js`). Every
      // scene shares this context-wide fixture, so leaving this `true` here
      // made "Describe a meal" render on scenes that never opted in. Scene
      // `11-quickadd-proposal` flips it on for itself with a page-scoped
      // GraphQL stub, same pattern as bookgeek's `07-what-next`/
      // `08-edit-metadata-draft` (README "Night 2").
      __typename: 'AiFeatures', natural_language_food_logging: false, meal_suggestions: true,
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

// FitnessMeal — MyMeals (GetFitnessMeals). Two saved meals, food_items each
// pointing at a real FOODS row so nutrition math (mealSummary in MyMeals.jsx)
// has something real to add up.
export const FITNESS_MEALS = [
  {
    __typename: 'FitnessMeal', id: 'meal1', name: 'Post-Workout Shake', meal_type: 'snack',
    food_items: [
      { __typename: 'FitnessMealItem', servings: 1, food_item_id: FOODS[0] },
      { __typename: 'FitnessMealItem', servings: 0.5, food_item_id: FOODS[2] },
    ],
    totalNutrition: nut(272, 21, 11, 17, 1.75),
  },
  {
    __typename: 'FitnessMeal', id: 'meal2', name: 'Sunday Steak Dinner', meal_type: 'dinner',
    food_items: [
      { __typename: 'FitnessMealItem', servings: 1.5, food_item_id: FOODS[1] },
      { __typename: 'FitnessMealItem', servings: 2, food_item_id: FOODS[3] },
    ],
    totalNutrition: nut(705, 47, 44, 36.5, 2),
  },
];

// FitnessMedication — Medications.jsx (GetFitnessMedications). Every fixture
// row keeps `rxcui: null` on purpose: Medications.startEdit only calls
// medsService.getDetails(rxcui) when rxcui is truthy, and that call is REST
// (not GraphQL) with no fixture route of its own — leaving rxcui set would
// make the edit scene depend on the generic `/\/api\//` catch-all resolving
// to something sane instead of a real, deterministic strengths list.
export const MEDICATIONS = [
  {
    __typename: 'FitnessMedication', id: 'med1', display_name: 'Lisinopril', is_supplement: false,
    med_type: 'rx', rxcui: null, ingredient_name: 'Lisinopril', brand_name: null, form: 'tablet',
    route: 'oral', strength: '10 mg', dose_value: 1, dose_unit: 'tablet', sig: 'Once daily',
    times_of_day: ['morning'], suggested_indications: ['Blood pressure'], user_indications: ['Blood pressure'],
    // 25 of 30 days elapsed — 5 days left, under the 7-day low-supply floor.
    supply_start_date: daysAgo(25), days_supply: 30, notes: null,
  },
  {
    __typename: 'FitnessMedication', id: 'med2', display_name: 'Vitamin D3', is_supplement: true,
    med_type: 'supplement', rxcui: null, ingredient_name: 'Cholecalciferol', brand_name: null, form: 'softgel',
    route: 'oral', strength: '2000 IU', dose_value: 1, dose_unit: 'softgel', sig: null,
    times_of_day: ['morning', 'evening'], suggested_indications: [], user_indications: ['Bone health'],
    supply_start_date: daysAgo(10), days_supply: 90, notes: null,
  },
  {
    __typename: 'FitnessMedication', id: 'med3', display_name: 'Ibuprofen', is_supplement: false,
    med_type: 'otc', rxcui: null, ingredient_name: 'Ibuprofen', brand_name: 'Advil', form: 'tablet',
    route: 'oral', strength: '200 mg', dose_value: 2, dose_unit: 'tablet', sig: 'As needed',
    times_of_day: ['afternoon'], suggested_indications: [], user_indications: [],
    supply_start_date: null, days_supply: null, notes: 'As needed for headaches',
  },
  {
    __typename: 'FitnessMedication', id: 'med4', display_name: 'Metformin', is_supplement: false,
    med_type: 'rx', rxcui: null, ingredient_name: 'Metformin', brand_name: null, form: 'tablet',
    route: 'oral', strength: '500 mg', dose_value: 1, dose_unit: 'tablet', sig: 'Twice daily with food',
    times_of_day: ['morning', 'evening'], suggested_indications: ['Diabetes'], user_indications: ['Diabetes', 'Blood sugar'],
    supply_start_date: daysAgo(20), days_supply: 30, notes: null,
  },
];

// GarminActivity — Activity.jsx "Recent Activities". Field names match the
// real `garminActivities` schema (apiService.js's GET_GARMIN_ACTIVITIES), not
// the stale, wrong-field fixture this replaced (see GetGarminDaily below).
export const GARMIN_ACTIVITIES = [
  {
    __typename: 'GarminActivity', activityId: 'act1', activityName: 'Morning Run', activityType: 'running',
    startTimeLocal: `${TODAY}T06:45:00`, duration: 2130, distance: 6200, calories: 410, averageHR: 148, maxHR: 172, steps: 7800,
  },
  {
    __typename: 'GarminActivity', activityId: 'act2', activityName: 'Evening Ride', activityType: 'cycling',
    startTimeLocal: `${daysAgo(1)}T18:05:00`, duration: 3600, distance: 18500, calories: 520, averageHR: 132, maxHR: 159, steps: 0,
  },
  {
    __typename: 'GarminActivity', activityId: 'act3', activityName: 'Strength Training', activityType: 'strength_training',
    startTimeLocal: `${daysAgo(2)}T17:15:00`, duration: 2700, distance: 0, calories: 260, averageHR: 108, maxHR: 138, steps: 0,
  },
];

// Real `garminStatus`/`garminDaily`/`garminSleep` field names, per
// apiService.js's GET_GARMIN_STATUS/GET_GARMIN_DAILY/GET_GARMIN_SLEEP
// documents — Activity.jsx is the first scene to actually read `enabled`,
// `restingHR`, `sleepMinutes` etc., and the OPS below used to carry a
// different, non-schema field set (`connected`, `restingHeartRate`,
// `distance`, `floors`, `intensityMinutes`) that nothing ever read. Fixed
// here rather than left stale, since a fixture that doesn't match the real
// schema is exactly the kind of gap this task exists to close.
export const GARMIN_STATUS = {
  __typename: 'GarminStatus', enabled: true, hasCredentials: true, hasTokens: true, lastConnectedAt: daysAgo(1),
};

export const GARMIN_DAILY = {
  __typename: 'GarminDaily', date: TODAY, steps: 8421, activeCalories: 512, restingHR: 54,
  weightLbs: 214.2, sleepMinutes: 431, fetchedAt: new Date().toISOString(), lastSyncAt: daysAgo(0),
};

export const GARMIN_SLEEP = {
  __typename: 'GarminSleep', date: TODAY,
  totalSleepMinutes: 431, deepSleepMinutes: 96, lightSleepMinutes: 238, remSleepMinutes: 82, awakeSleepMinutes: 15,
  sleepStartTime: `${daysAgo(1)}T23:10:00`, sleepEndTime: `${TODAY}T06:21:00`,
  sleepScore: 78, sleepQuality: 'good', sleepFeedback: null,
  restingHeartRate: 54, avgOvernightHrv: 62, hrvStatus: 'balanced',
  avgSpO2: 96, minSpO2: 92, avgRespiration: 14.2, minRespiration: 12, maxRespiration: 17,
  avgSleepStress: 22, restlessMoments: 6, awakeCount: 3, bodyBatteryChange: 68, sleepInsight: 'NORMAL',
};

// FitnessFoodReportOverview/Trends — Reports.jsx. Both resolve to
// `FitnessJSON` scalars on the backend (see apiService.js's comment on
// GET_FOOD_REPORT_OVERVIEW), i.e. free-form JSON with no sub-field
// selection — fixture shape only needs to match what Reports.jsx and
// DayRibbon.jsx read off it.
const REPORT_DAILY = Array.from({ length: 7 }, (_, i) => {
  const n = 6 - i;
  const base = 2050 + ((i * 37) % 260) - 90;
  return {
    date: daysAgo(n),
    calories: Math.round(base),
    protein: Math.round(150 + ((i * 5) % 20)),
    carbs: Math.round(190 + ((i * 11) % 40)),
    fat: Math.round(70 + ((i * 3) % 15)),
    fiber: Math.round(18 + (i % 6)),
  };
});

export const FOOD_REPORT_OVERVIEW = {
  range: { start: daysAgo(6), end: TODAY },
  totals: { calories: 14520, protein_grams: 1085, carbs_grams: 1540, fat_grams: 560, fiber_grams: 152, sugar_grams: 210 },
  averages: { calories: 2074, protein: 155, carbs: 220, fat: 80, fiber: 21.7, sugar: 30 },
  targets: { calories: 2340, protein: 156, carbs: 148, fat: 78, fiber: 30 },
  daily: REPORT_DAILY,
  meals: {
    breakfast: { calories: 420, count: 7, protein: 28 },
    lunch: { calories: 610, count: 7, protein: 42 },
    dinner: { calories: 780, count: 7, protein: 50 },
    snack: { calories: 264, count: 5, protein: 10 },
  },
  topFoods: [
    { name: 'Greek Yogurt, Plain Whole Milk', count: 6, calories: 1140 },
    { name: 'Ribeye Steak, grilled', count: 4, calories: 1240 },
    { name: 'Almonds, raw', count: 5, calories: 820 },
    { name: 'Sourdough Bread', count: 8, calories: 960 },
  ],
  goalCompliance: {
    calories: { daysWithin: 5, percentage: 71 },
    protein: { daysWithin: 6, percentage: 86 },
  },
};

export const FOOD_REPORT_TRENDS = {
  range: { start: daysAgo(6), end: TODAY },
  daily: REPORT_DAILY,
  rolling: REPORT_DAILY.map((d, i) => ({ date: d.date, avgCalories: 2050 + i * 4 })),
  weights: WEIGHTS.slice(-7).map((w) => ({ date: w.log_date, weight: w.weight_value })),
  highlights: [
    'Protein has climbed steadily for 5 straight days.',
    'Weekend calories run about 18% higher than weekdays.',
    'Fiber intake is below target on 4 of the last 7 days.',
  ],
};

// Deep-search wave (foodService.search) and typeahead wave (foodService.suggest)
// are both REST — `/api/foods` and `/api/foods/suggest` — not GraphQL, so
// they need their own ctx.route stubs (see routes() below) rather than an
// OPS entry. `source` drives FoodResultRow's SOURCE_LABEL chip.
export const SEARCH_FOODS = [
  { id: 'sf1', name: 'Chocolate Chip Pancakes, homemade', brand: null, source: 'ai', nutrition: nut(220, 6, 28, 9, 1), serving_size: 1, serving_unit: 'pancake' },
  { id: 'sf2', name: 'Greek Yogurt, Plain Whole Milk', brand: 'Fage', source: 'custom', nutrition: nut(190, 18, 8, 10, 0), serving_size: 170, serving_unit: 'g' },
  { id: 'sf3', name: 'Chicken Breast, grilled', brand: null, source: 'usda', nutrition: nut(165, 31, 0, 3.6, 0), serving_size: 100, serving_unit: 'g' },
];

// InfluxDB intraday series — HealthDashboard's Overview tab (IntradayDashboard)
// and Meal Impact tab (MealImpactVisualization) both read this, direct REST
// (`influxService.getIntraday`), never GraphQL. Raw column names on purpose —
// `normalizeIntraday` (src/components/intradaySeries.js) is what maps
// `HeartRate`/`stressLevel`/`BodyBatteryLevel` to a uniform `value`, and a
// fixture that pre-normalized the shape would never exercise that mapping.
// Half-hourly for 18 hours (06:00–24:00) — enough for a real-looking nivo
// line, not so much that the fixture is unreadable.
const intradaySeries = (base, amplitude, seedOffset) => Array.from({ length: 36 }, (_, i) => {
  const d = new Date(`${TODAY}T06:00:00`);
  d.setMinutes(d.getMinutes() + i * 30);
  const value = Math.round(base + amplitude * Math.sin((i + seedOffset) / 4));
  return { time: d.toISOString(), value };
});

export const INTRADAY = {
  heartRate: intradaySeries(72, 14, 0).map((p) => ({ time: p.time, HeartRate: p.value })),
  stress: intradaySeries(32, 18, 3).map((p) => ({ time: p.time, stressLevel: Math.max(0, p.value) })),
  bodyBattery: intradaySeries(58, 22, 6).map((p) => ({ time: p.time, BodyBatteryLevel: Math.max(0, Math.min(100, p.value)) })),
  breathing: intradaySeries(15, 2, 1).map((p) => ({ time: p.time, BreathingRate: p.value })),
};

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
  GetFitnessMeals: { fitnessMeals: FITNESS_MEALS },
  GetFitnessMedications: { fitnessMedications: MEDICATIONS },
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
  GetGarminStatus: { garminStatus: GARMIN_STATUS },
  GetGarminDaily: { garminDaily: GARMIN_DAILY },
  GetGarminSleep: { garminSleep: GARMIN_SLEEP },
  GetGarminActivities: { garminActivities: GARMIN_ACTIVITIES },
  GetMorningBrief: { fitnessInsightsMorningBrief: null },
  GetDailyInsightSummary: { fitnessInsightsDailySummary: null },
  GetCorrelations: { fitnessInsightsCorrelations: null },
  GetWeeklyInsightReport: { fitnessInsightsWeeklyReport: null },
  GetTrendWatch: { fitnessInsightsTrendWatch: null },
  GetCoaching: { fitnessInsightsCoaching: null },
  GetAiContext: { fitnessInsightsContext: null },
  GetFoodReportOverview: { fitnessFoodReportOverview: FOOD_REPORT_OVERVIEW },
  GetFoodReportTrends: { fitnessFoodReportTrends: FOOD_REPORT_TRENDS },
};

export async function routes(ctx, { base, scheme, viewport } = {}) {
  await sessionRoutes(ctx);
  await graphqlRoute(ctx, OPS);

  // foodService.search()/suggest() (FoodSearch page, MealImpactVisualization's
  // meals fetch is GraphQL — this pair is the REST half) go straight to the
  // fitnessgeek backend, not through the GraphQL proxy. Broad glob first,
  // narrower `/suggest` registered after so it wins (README "Writing
  // fixtures" #1 — Playwright matches routes newest-first).
  await ctx.route('**/api/foods*', (r) => json(r, { success: true, data: SEARCH_FOODS }));
  await ctx.route('**/api/foods/suggest*', (r) => json(r, { success: true, data: SEARCH_FOODS.slice(0, 2) }));

  // influxService — HealthDashboard's Overview/Meal Impact tabs. Direct REST,
  // also not GraphQL. `unwrap()` in influxService.js reads `response.data`, so
  // the body IS the intraday object — no `{success,data}` envelope here.
  await ctx.route('**/api/influx/intraday/**', (r) => json(r, INTRADAY));
}
