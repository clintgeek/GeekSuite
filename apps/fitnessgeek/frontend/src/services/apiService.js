import { createApolloClient } from '@geeksuite/api-client';
import { gql } from '@apollo/client';
import logger from '../utils/logger.js';

const apolloClient = createApolloClient('fitnessgeek');

// Convert old REST patterns into Apollo Client operations.

// -------------------------------------------------------------
// Auto-generated GraphQL documents based on known old REST urls
// -------------------------------------------------------------

const GET_USER_SETTINGS = gql`
  query GetFitnessUserSettings { fitnessUserSettings { id theme influxEnabled dashboard { show_current_weight show_blood_pressure show_calories_today show_login_streak show_nutrition_today show_garmin_summary show_quick_actions show_weight_goal show_nutrition_goal card_order } garmin { enabled username last_connected_at } healthBaselines { weeklyHRV restingHR lastUpdated } notifications { enabled daily_reminder goal_reminders } nutrition_goal { enabled start_date start_weight target_weight activity_level weight_change_rate plan_type calorie_target_mode auto_base_calories fixed_calories activity_eatback_fraction activity_eatback_cap_kcal protein_g_per_lb_goal fat_g_per_lb_goal goal_weight_lbs show_adjustment daily_calorie_target weekly_schedule min_safe_calories bmr tdee timeline_weeks estimated_end_date } weight_goal { enabled startWeight targetWeight startDate goalDate ratePerWeek lastRecalculated unit is_active } units { weight height } ai { enabled features { natural_language_food_logging meal_suggestions nutrition_analysis goal_recommendations } } household { household_id display_name share_food_logs share_weight share_meals } favorite_foods { id name brand } } }
`;

const UPDATE_USER_SETTINGS = gql`
  mutation UpdateFitnessUserSettings($input: FitnessUserSettingsInput!) { updateFitnessUserSettings(input: $input) { id theme } }
`;

const GET_WEIGHTS = gql`
  query GetFitnessWeights { fitnessWeights { id weight_value log_date notes formatted_date } }
`;

const ADD_WEIGHT = gql`
  mutation AddFitnessWeight($input: WeightInput!) { addFitnessWeight(input: $input) { id weight_value log_date notes formatted_date } }
`;

const UPDATE_WEIGHT = gql`
  mutation UpdateFitnessWeight($id: ID!, $input: WeightInput!) { updateFitnessWeight(id: $id, input: $input) { id } }
`;

const DELETE_WEIGHT = gql`
  mutation DeleteFitnessWeight($id: ID!) { deleteFitnessWeight(id: $id) }
`;

const GET_NUTRITION_GOALS = gql`
  query GetActiveNutritionGoals { activeNutritionGoals { id calories protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg start_date end_date is_active } }
`;

const SET_NUTRITION_GOALS = gql`
  mutation SetNutritionGoals($input: NutritionGoalsInput!) { setNutritionGoals(input: $input) { id } }
`;

const GET_FOOD_ITEMS = gql`
  query GetFitnessFoods($search: String) { fitnessFoods(search: $search) { id name brand serving_size serving_unit nutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg } barcode is_verified } }
`;

const GET_FOOD_LOGS = gql`
  query GetFoodLogs($date: Date, $startDate: Date, $endDate: Date, $mealType: String) { foodLogs(date: $date, startDate: $startDate, endDate: $endDate, mealType: $mealType) { id log_date meal_type servings notes nutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg } calculatedNutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg } food_item_id { id name brand serving_size serving_unit barcode } } }
`;

const ADD_FOOD_LOG = gql`
  mutation AddFoodLog($input: FoodLogInput!) { addFoodLog(input: $input) { id } }
`;

const UPDATE_FOOD_LOG = gql`
  mutation UpdateFoodLog($id: ID!, $input: FoodLogInput!) { updateFoodLog(id: $id, input: $input) { id } }
`;

const DELETE_FOOD_LOG = gql`
  mutation DeleteFoodLog($id: ID!) { deleteFoodLog(id: $id) }
`;

// ─── FitnessFood (food LIBRARY items, not log entries) ───────────
const GET_FOOD_ITEM = gql`
  query GetFitnessFood($id: ID!) { fitnessFood(id: $id) { id name brand serving_size serving_unit barcode nutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg } } }
`;

const ADD_FITNESS_FOOD = gql`
  mutation AddFitnessFood($input: FitnessFoodInput!) { addFitnessFood(input: $input) { id name brand serving_size serving_unit nutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg } } }
`;

const UPDATE_FITNESS_FOOD = gql`
  mutation UpdateFitnessFood($id: ID!, $input: FitnessFoodInput!) { updateFitnessFood(id: $id, input: $input) { id } }
`;

const DELETE_FITNESS_FOOD = gql`
  mutation DeleteFitnessFood($id: ID!) { deleteFitnessFood(id: $id) }
`;

const GET_MEALS = gql`
  query GetFitnessMeals($mealType: String) { fitnessMeals(mealType: $mealType) { id name meal_type food_items { servings food_item_id { id name brand serving_size serving_unit nutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg } } } totalNutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg } } }
`;

const ADD_MEAL = gql`
  mutation AddFitnessMeal($input: FitnessMealInput!) { addFitnessMeal(input: $input) { id } }
`;

const UPDATE_MEAL = gql`
  mutation UpdateFitnessMeal($id: ID!, $input: FitnessMealInput!) { updateFitnessMeal(id: $id, input: $input) { id } }
`;

const DELETE_MEAL = gql`
  mutation DeleteFitnessMeal($id: ID!) { deleteFitnessMeal(id: $id) }
`;

const GET_MEDICATIONS = gql`
  query GetFitnessMedications { fitnessMedications { id display_name is_supplement med_type rxcui ingredient_name brand_name form route strength dose_value dose_unit sig times_of_day suggested_indications user_indications supply_start_date days_supply notes } }
`;

const ADD_MEDICATION = gql`
  mutation AddFitnessMedication($input: FitnessMedicationInput!) { addFitnessMedication(input: $input) { id } }
`;

const UPDATE_MEDICATION = gql`
  mutation UpdateFitnessMedication($id: ID!, $input: FitnessMedicationInput!) { updateFitnessMedication(id: $id, input: $input) { id } }
`;

const DELETE_MEDICATION = gql`
  mutation DeleteFitnessMedication($id: ID!) { deleteFitnessMedication(id: $id) }
`;

const GET_BPS = gql`
  query GetBps { bloodPressures { id systolic diastolic pulse log_date notes formatted_date status } }
`;

const ADD_BP = gql`
  mutation AddBp($input: BloodPressureInput!) { addBloodPressure(input: $input) { id systolic diastolic pulse log_date notes formatted_date status } }
`;

const UPDATE_BP = gql`
  mutation UpdateBp($id: ID!, $input: BloodPressureInput!) { updateBloodPressure(id: $id, input: $input) { id } }
`;

const DELETE_BP = gql`
  mutation DeleteBp($id: ID!) { deleteBloodPressure(id: $id) }
`;

const GET_LOGIN_STREAK = gql`
  query GetLoginStreak { loginStreak { currentStreak longestStreak lastLoginDate streakStartDate } }
`;

const RECORD_LOGIN_STREAK = gql`
  mutation RecordLoginStreak { recordLoginStreak { currentStreak longestStreak lastLoginDate streakStartDate } }
`;

const GET_DAILY_SUMMARY = gql`
  query GetDailySummary($date: String) {
    dailySummary(date: $date) {
      date
      calorieGoal
      totals { calories protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg }
      meals {
        breakfast { calories protein_grams carbs_grams fat_grams }
        lunch { calories protein_grams carbs_grams fat_grams }
        dinner { calories protein_grams carbs_grams fat_grams }
        snack { calories protein_grams carbs_grams fat_grams }
      }
    }
  }
`;

const GET_WEEKLY_SUMMARY = gql`
  query GetWeeklySummary($startDate: String!) { weeklySummary(startDate: $startDate) }
`;

const GET_DERIVED_MACROS = gql`
  query GetDerivedMacros {
    derivedMacros {
      todayIndex
      calories { daily weekly_schedule }
      fixed { protein_g fat_g protein_kcal fat_kcal }
      rules { goal_weight_lbs protein_g_per_lb fat_g_per_lb calorie_target_mode activity_eatback_fraction activity_eatback_cap_kcal }
      today { dayIndex base_calories activity_add_kcal target_calories protein_g fat_g carbs_g }
      weekly { dayIndex base_calories activity_add_kcal target_calories protein_g fat_g carbs_g }
    }
  }
`;

const GET_HOUSEHOLD = gql`
  query GetFitnessHousehold { fitnessHousehold { household_id display_name share_food_logs share_weight share_meals members { user_id display_name shares_food_logs shares_meals } } }
`;

const JOIN_HOUSEHOLD = gql`
  mutation JoinFitnessHousehold($household_id: String!, $display_name: String!) {
    joinFitnessHousehold(household_id: $household_id, display_name: $display_name) { household_id }
  }
`;

const CREATE_HOUSEHOLD = gql`
  mutation CreateFitnessHousehold($display_name: String!) {
    createFitnessHousehold(display_name: $display_name) { household_id }
  }
`;

const LEAVE_HOUSEHOLD = gql`
  mutation LeaveFitnessHousehold { leaveFitnessHousehold }
`;

const UPDATE_HOUSEHOLD_SETTINGS = gql`
  mutation UpdateFitnessHouseholdSettings($input: FitnessJSON!) {
    updateFitnessHouseholdSettings(input: $input) { household_id }
  }
`;

// copyFitnessMeal takes flat args (from_date, to_date, from_meal_type, to_meal_type, from_user_id)
// and returns [FoodLog], NOT a CopyMealInput + { success }. Query was wrong.
const COPY_MEAL = gql`
  mutation CopyFitnessMeal(
    $from_date: String!
    $to_date: String!
    $from_meal_type: String
    $to_meal_type: String
    $from_user_id: ID
  ) {
    copyFitnessMeal(
      from_date: $from_date
      to_date: $to_date
      from_meal_type: $from_meal_type
      to_meal_type: $to_meal_type
      from_user_id: $from_user_id
    ) { id }
  }
`;

const GET_HOUSEHOLD_MEMBER_LOGS = gql`
  query GetHouseholdMemberLogs($memberId: ID!, $date: Date!) { fitnessHouseholdMemberLogs(memberId: $memberId, date: $date) { id log_date meal_type servings calculatedNutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg } food_item_id { id name brand } } }
`;

// Report types resolve to FitnessJSON scalars on the backend — select them
// as-is without sub-field selection or GraphQL rejects the query with 400.
const GET_FOOD_REPORT_OVERVIEW = gql`
  query GetFoodReportOverview($start: String, $days: Int) {
    fitnessFoodReportOverview(start: $start, days: $days) {
      range
      totals
      averages
      daily
      meals
      topFoods
      goalCompliance
    }
  }
`;

const GET_FOOD_REPORT_TRENDS = gql`
  query GetFoodReportTrends($start: String, $days: Int) {
    fitnessFoodReportTrends(start: $start, days: $days) {
      range
      daily
      rolling
      weights
      highlights
    }
  }
`;

const GET_MORNING_BRIEF = gql` query GetMorningBrief { fitnessInsightsMorningBrief { type content generatedAt context } } `;
const GET_DAILY_INSIGHT_SUMMARY = gql` query GetDailyInsightSummary($date: String) { fitnessInsightsDailySummary(date: $date) { type content generatedAt context } } `;
const GET_CORRELATIONS = gql` query GetCorrelations { fitnessInsightsCorrelations { type content generatedAt context } } `;
const GET_WEEKLY_INSIGHT_REPORT = gql` query GetWeeklyInsightReport($start: String, $days: Int) { fitnessInsightsWeeklyReport(start: $start, days: $days) { type content generatedAt context } } `;
const GET_TREND_WATCH = gql` query GetTrendWatch($start: String, $days: Int) { fitnessInsightsTrendWatch(start: $start, days: $days) { type content generatedAt context } } `;
const GET_COACHING = gql` query GetCoaching { fitnessInsightsCoaching { type content generatedAt context } } `;
const GET_AI_CONTEXT = gql` query GetAiContext($days: Int) { fitnessInsightsContext(days: $days) } `;
const AI_CHAT = gql` mutation AiChat($message: String!, $history: [ChatMessageInput]) { fitnessInsightsChat(message: $message, history: $history) { type content generatedAt } } `;

const GET_GARMIN_STATUS = gql`
  query GetGarminStatus { garminStatus { enabled hasCredentials hasTokens lastConnectedAt } }
`;

const GET_GARMIN_DAILY = gql`
  query GetGarminDaily($date: String) { garminDaily(date: $date) { date steps activeCalories restingHR weightLbs sleepMinutes fetchedAt lastSyncAt } }
`;

const GET_GARMIN_SLEEP = gql`
  query GetGarminSleep($date: String) { garminSleep(date: $date) { date totalSleepMinutes deepSleepMinutes lightSleepMinutes remSleepMinutes awakeSleepMinutes sleepStartTime sleepEndTime sleepScore sleepQuality sleepFeedback restingHeartRate avgOvernightHrv hrvStatus avgSpO2 avgRespiration avgSleepStress bodyBatteryChange } }
`;

const GET_GARMIN_ACTIVITIES = gql`
  query GetGarminActivities($start: Int, $limit: Int) { garminActivities(start: $start, limit: $limit) { activityId activityName activityType startTimeLocal duration distance calories averageHR maxHR steps } }
`;

const UPDATE_GARMIN_WEIGHT = gql`
  mutation UpdateGarminWeight($date: String, $weightLbs: Float!, $timezone: String) { updateGarminWeight(date: $date, weightLbs: $weightLbs, timezone: $timezone) }
`;

const REFRESH_DAILY_SUMMARY = gql`
  mutation RefreshDailySummary($date: String) { refreshDailySummary(date: $date) { date totals { calories protein_grams carbs_grams fat_grams } } }
`;

const LOG_MEAL = gql`
  mutation LogMeal($mealId: ID!, $date: String!, $mealType: String) { logMeal(mealId: $mealId, date: $date, mealType: $mealType) { id log_date meal_type servings nutrition { calories_per_serving } food_item_id { id name } } }
`;

// Helper map to route Axios urls to GraphQL ops
function routeRequest(method, url, data) {
  // Normalize
  let base = url.split('?')[0];
  if (base.endsWith('/')) base = base.slice(0, -1);
  const parts = base.split('/').filter(Boolean);

  // Strip fields that don't belong in FitnessUserSettingsInput
  const sanitizeSettingsInput = (raw) => {
    const { id, _id, user_id, __typename, favorite_foods, created_at, updated_at, ...clean } = raw || {};
    return clean;
  };

  // Normalize a food payload into FitnessFoodInput shape.
  // Frontend sends { name, brand, nutrition, serving: { size, unit }, barcode, source, ... }
  // Backend wants  { name, brand, serving_size, serving_unit, barcode, nutrition: {...} }
  const normalizeFoodInput = (raw = {}) => {
    const serving_size = raw.serving_size ?? raw.serving?.size ?? 100;
    const serving_unit = raw.serving_unit ?? raw.serving?.unit ?? 'g';
    const n = raw.nutrition || {};
    return {
      name: raw.name,
      brand: raw.brand || undefined,
      serving_size: Number(serving_size) || 100,
      serving_unit: String(serving_unit || 'g'),
      ...(raw.barcode ? { barcode: String(raw.barcode) } : {}),
      nutrition: {
        calories_per_serving: Number(n.calories_per_serving) || 0,
        protein_grams: Number(n.protein_grams) || 0,
        carbs_grams: Number(n.carbs_grams) || 0,
        fat_grams: Number(n.fat_grams) || 0,
        fiber_grams: Number(n.fiber_grams) || 0,
        sugar_grams: Number(n.sugar_grams) || 0,
        sodium_mg: Number(n.sodium_mg) || 0,
      },
    };
  };

  if (method === 'GET') {
    if (base === '/settings') return { query: GET_USER_SETTINGS };
    // /user/settings is an alias — same underlying FitnessUserSettings document
    if (base === '/user/settings') return { query: GET_USER_SETTINGS };
    if (base === '/weight') return { query: GET_WEIGHTS };
    if (base === '/goals/nutrition/macros' || base === '/goals/nutrition') return { query: GET_DERIVED_MACROS };
    if (base === '/goals') return { query: GET_DERIVED_MACROS };
    if (base === '/foods') return { query: GET_FOOD_ITEMS, variables: { search: url.includes('search=') ? new URLSearchParams(url.split('?')[1]).get('search') : null } };
    // Single food item lookup: /foods/:id (24-char Mongo ObjectId)
    if (parts[0] === 'foods' && parts[1] && /^[0-9a-f]{24}$/i.test(parts[1])) {
      return { query: GET_FOOD_ITEM, variables: { id: parts[1] } };
    }
    if (base === '/logs') {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_FOOD_LOGS, variables: { date: sp.get('date'), startDate: sp.get('startDate'), endDate: sp.get('endDate'), mealType: sp.get('mealType') } };
    }
    if (base.startsWith('/logs/ household/')) { // Handle potential space issue in old code
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_HOUSEHOLD_MEMBER_LOGS, variables: { memberId: parts[2], date: parts[3] || sp.get('date') } };
    }
    if (base.startsWith('/logs/')) return { query: GET_FOOD_LOGS, variables: { date: parts[1] } }; // /logs/YYYY-MM-DD
    if (base === '/meals') return { query: GET_MEALS };
    if (base.startsWith('/meals/')) return { query: GET_MEALS, variables: { mealType: parts[1] } };
    if (base === '/medications' || base === '/meds') return { query: GET_MEDICATIONS };
    if (base === '/bp' || base === '/blood-pressure') return { query: GET_BPS };
    if (parts[0] === 'blood-pressure' && parts[1]) return { query: GET_BPS }; // Handle /blood-pressure/:id
    if (parts[0] === 'weight' && parts[1]) return { query: GET_WEIGHTS }; // Handle /weight/:id
    if (base === '/streaks/login') return { query: GET_LOGIN_STREAK };
    if (base === '/summary/today') return { query: GET_DAILY_SUMMARY };
    if (base.match(/^\/summary\/week\//)) return { query: GET_WEEKLY_SUMMARY, variables: { startDate: parts[2] } };
    if (base.match(/^\/summary\//)) return { query: GET_DAILY_SUMMARY, variables: { date: parts[1] } };
    if (base === '/summary') return { query: GET_DAILY_SUMMARY };

    if (base === '/settings/household') return { query: GET_HOUSEHOLD };
    if (base.match(/^\/logs\/household\//)) {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_HOUSEHOLD_MEMBER_LOGS, variables: { memberId: parts[2], date: parts[3] || sp.get('date') } };
    }
    if (base === '/food-reports/overview') {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_FOOD_REPORT_OVERVIEW, variables: { start: sp.get('start'), days: parseInt(sp.get('days')) || 7 } };
    }
    if (base === '/food-reports/trends') {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_FOOD_REPORT_TRENDS, variables: { start: sp.get('start'), days: parseInt(sp.get('days')) || 30 } };
    }
    if (base === '/insights/morning-brief') return { query: GET_MORNING_BRIEF };
    if (base === '/insights/daily-summary') {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_DAILY_INSIGHT_SUMMARY, variables: { date: sp.get('date') } };
    }
    if (base === '/insights/correlations') return { query: GET_CORRELATIONS };
    if (base === '/insights/weekly-report') {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_WEEKLY_INSIGHT_REPORT, variables: { start: sp.get('start'), days: parseInt(sp.get('days')) || 7 } };
    }
    if (base === '/insights/trend-watch') {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_TREND_WATCH, variables: { start: sp.get('start'), days: parseInt(sp.get('days')) || 30 } };
    }
    if (base === '/insights/coaching') return { query: GET_COACHING };
    if (base === '/insights/context') {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_AI_CONTEXT, variables: { days: parseInt(sp.get('days')) || 7 } };
    }

    if (base === '/fitness/garmin/status') return { query: GET_GARMIN_STATUS };
    if (base.match(/^\/fitness\/garmin\/daily/)) {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_GARMIN_DAILY, variables: { date: parts[3] || sp.get('date') } };
    }
    if (base.match(/^\/fitness\/garmin\/sleep/)) {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_GARMIN_SLEEP, variables: { date: parts[3] || sp.get('date') } };
    }
    if (base === '/fitness/garmin/activities') {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_GARMIN_ACTIVITIES, variables: { start: parseInt(sp.get('start')) || 0, limit: parseInt(sp.get('limit')) || 20 } };
    }

    // Fallbacks or unimplemented routes for mock REST
    logger.warn('GraphQL Migration: Unmapped GET route:', url);
    return null;
  }

  if (method === 'POST') {
    if (base === '/streaks/login') return { mutation: RECORD_LOGIN_STREAK };
    if (base === '/settings/household/create') {
      return {
        mutation: CREATE_HOUSEHOLD,
        variables: { display_name: data.display_name || data.displayName || 'My Household' },
      };
    }
    if (base === '/settings/household/join') {
      return {
        mutation: JOIN_HOUSEHOLD,
        variables: {
          household_id: data.household_id || data.householdId,
          display_name: data.display_name || data.displayName || 'Member',
        },
      };
    }
    if (base === '/logs/copy') {
      return {
        mutation: COPY_MEAL,
        variables: {
          from_date: data.from_date || data.fromDate,
          to_date: data.to_date || data.toDate,
          from_meal_type: data.from_meal_type || data.fromMealType || null,
          to_meal_type: data.to_meal_type || data.toMealType || null,
          from_user_id: data.from_user_id || data.fromUserId || null,
        },
      };
    }
    if (base === '/insights/chat') return { mutation: AI_CHAT, variables: { message: data.message, history: data.history } };
    if (base === '/fitness/garmin/weight') return { mutation: UPDATE_GARMIN_WEIGHT, variables: { date: data.date, weightLbs: data.weightLbs, timezone: data.timezone } };
    if (base.match(/^\/summary\//)) return { mutation: REFRESH_DAILY_SUMMARY, variables: { date: parts[1] } };
    if (base.match(/^\/meals\/.+\/add-to-log/)) return { mutation: LOG_MEAL, variables: { mealId: parts[1], date: data.date, mealType: data.mealType } };
    if (base === '/weight') return { mutation: ADD_WEIGHT, variables: { input: data } };
    if (base === '/goals') return { mutation: SET_NUTRITION_GOALS, variables: { input: data } };
    // /foods creates a library FoodItem (not a log entry)
    if (base === '/foods') return { mutation: ADD_FITNESS_FOOD, variables: { input: normalizeFoodInput(data) } };
    if (base === '/logs') return { mutation: ADD_FOOD_LOG, variables: { input: data } };
    if (base === '/meals') return { mutation: ADD_MEAL, variables: { input: data } };
    if (base === '/medications' || base === '/meds') return { mutation: ADD_MEDICATION, variables: { input: data } };
    if (base === '/bp' || base === '/blood-pressure') return { mutation: ADD_BP, variables: { input: data } };

    // App settings updates via PUT/POST mixed
    if (base.startsWith('/settings/')) {
      return { mutation: UPDATE_USER_SETTINGS, variables: { input: sanitizeSettingsInput(data) } };
    }
    return null;
  }

  if (method === 'PUT') {
    const id = parts[1]; // /resource/:id
    if (base === '/settings') return { mutation: UPDATE_USER_SETTINGS, variables: { input: sanitizeSettingsInput(data) } };
    // /user/settings is an alias for /settings (PATCH and PUT both hit this)
    if (base === '/user/settings') return { mutation: UPDATE_USER_SETTINGS, variables: { input: sanitizeSettingsInput(data) } };
    if (base === '/settings/household') return { mutation: UPDATE_HOUSEHOLD_SETTINGS, variables: { input: data } };
    if (parts[0] === 'settings') return { mutation: UPDATE_USER_SETTINGS, variables: { input: sanitizeSettingsInput(data) } }; // /settings/dashboard etc
    if (parts[0] === 'weight') return { mutation: UPDATE_WEIGHT, variables: { id, input: data } };
    // /foods/:id updates a library FoodItem (not a log entry)
    if (parts[0] === 'foods') return { mutation: UPDATE_FITNESS_FOOD, variables: { id, input: normalizeFoodInput(data) } };
    if (parts[0] === 'logs') return { mutation: UPDATE_FOOD_LOG, variables: { id, input: data } };
    if (parts[0] === 'meals') return { mutation: UPDATE_MEAL, variables: { id, input: data } };
    if (parts[0] === 'medications' || parts[0] === 'meds') return { mutation: UPDATE_MEDICATION, variables: { id, input: data } };
    if (parts[0] === 'bp' || parts[0] === 'blood-pressure') return { mutation: UPDATE_BP, variables: { id, input: data } };
    return null;
  }

  if (method === 'DELETE') {
    const id = parts[1];
    if (base === '/settings/household') return { mutation: LEAVE_HOUSEHOLD };
    if (parts[0] === 'weight') return { mutation: DELETE_WEIGHT, variables: { id } };
    // /foods/:id deletes a library FoodItem (not a log entry)
    if (parts[0] === 'foods') return { mutation: DELETE_FITNESS_FOOD, variables: { id } };
    if (parts[0] === 'logs') return { mutation: DELETE_FOOD_LOG, variables: { id } };
    if (parts[0] === 'meals') return { mutation: DELETE_MEAL, variables: { id } };
    if (parts[0] === 'medications' || parts[0] === 'meds') return { mutation: DELETE_MEDICATION, variables: { id } };
    if (parts[0] === 'bp' || parts[0] === 'blood-pressure') return { mutation: DELETE_BP, variables: { id } };
    return null;
  }

  return null;
}

// Emulate old Axios API structure, but bridge it under the hood to Apollo
export const apiService = {
  get: async (url, config) => {
    let finalUrl = url;
    if (config?.params) {
      const q = new URLSearchParams(config.params).toString();
      if (q) finalUrl += (url.includes('?') ? '&' : '?') + q;
    }
    logger.debug('ApiService [Proxy] GET', finalUrl);
    const op = routeRequest('GET', finalUrl);
    if (!op) throw new Error(`Rest proxy gap: GET ${ finalUrl } not mapped to GraphQL.`);

    if (op._isMock) return { success: true, data: op.data };
    if (op._isMockInsight) {
      if (op.route === 'morning-brief' || op.route?.startsWith('daily-summary') || op.route?.startsWith('weekly-report') || op.route === 'trend-watch' || op.route === 'coaching' || op.route === 'correlations') {
        return { success: true, data: { type: op.route.split('?')[0].replace('-', '_'), content: "AI Insights coming soon.", generatedAt: new Date().toISOString() } };
      }
      return { success: true, data: null };
    }

    const res = await apolloClient.query({ ...op, fetchPolicy: 'no-cache' });
    // Attempt to automatically extract the root field the caller expects
    const keys = Object.keys(res.data || {});
    if (keys.length === 1) return { success: true, data: res.data[keys[0]] };
    return { success: true, data: res.data };
  },

  post: async (url, data, config) => {
    logger.debug('ApiService [Proxy] POST', url);
    const op = routeRequest('POST', url, data);
    if (!op) throw new Error(`Rest proxy gap: POST ${ url } not mapped.`);
    if (op._isMock) return { success: true, data: op.data };
    if (op._isMockInsight) return { success: true, data: { success: true } };
    const res = await apolloClient.mutate(op);
    const keys = Object.keys(res.data || {});
    if (keys.length === 1) return { success: true, data: res.data[keys[0]] };
    return { success: true, data: res.data };
  },

  put: async (url, data, config) => {
    logger.debug('ApiService [Proxy] PUT', url);
    const op = routeRequest('PUT', url, data);
    if (!op) throw new Error(`Rest proxy gap: PUT ${ url } not mapped.`);
    const res = await apolloClient.mutate(op);
    const keys = Object.keys(res.data || {});
    if (keys.length === 1) return { success: true, data: res.data[keys[0]] };
    return { success: true, data: res.data };
  },

  patch: async (url, data, config) => {
    return apiService.put(url, data, config); // Map patch to put
  },

  delete: async (url, config) => {
    logger.debug('ApiService [Proxy] DELETE', url);
    const op = routeRequest('DELETE', url);
    if (!op) throw new Error(`Rest proxy gap: DELETE ${ url } not mapped.`);
    const res = await apolloClient.mutate(op);
    const keys = Object.keys(res.data || {});
    if (keys.length === 1) return { success: true, data: res.data[keys[0]] };
    return { success: true, data: res.data };
  }
};