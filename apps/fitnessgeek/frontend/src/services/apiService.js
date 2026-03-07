import { createApolloClient } from '@geeksuite/api-client';
import logger from '../utils/logger.js';

const apolloClient = createApolloClient('fitnessgeek');

// Convert old REST patterns into Apollo Client operations.

// -------------------------------------------------------------
// Auto-generated GraphQL documents based on known old REST urls
// -------------------------------------------------------------

const GET_USER_SETTINGS = gql`
  query GetUserSettings { userSettings { id theme influxEnabled dashboard { show_current_weight show_blood_pressure show_calories_today show_login_streak show_nutrition_today show_garmin_summary show_quick_actions show_weight_goal show_nutrition_goal card_order } garmin { enabled username last_connected_at } healthBaselines { weeklyHRV restingHR lastUpdated } notifications { enabled daily_reminder goal_reminders } nutrition_goal { enabled start_date start_weight target_weight activity_level weight_change_rate plan_type calorie_target_mode auto_base_calories fixed_calories activity_eatback_fraction activity_eatback_cap_kcal protein_g_per_lb_goal fat_g_per_lb_goal goal_weight_lbs show_adjustment daily_calorie_target weekly_schedule min_safe_calories bmr tdee timeline_weeks estimated_end_date } weight_goal { enabled startWeight targetWeight startDate goalDate ratePerWeek lastRecalculated unit is_active } units { weight height } ai { enabled features { natural_language_food_logging meal_suggestions nutrition_analysis goal_recommendations } } household { household_id display_name share_food_logs share_weight share_meals } favorite_foods { id name brand } } }
`;

const UPDATE_USER_SETTINGS = gql`
  mutation UpdateUserSettings($input: UserSettingsInput!) { updateUserSettings(input: $input) { id theme } }
`;

const GET_WEIGHTS = gql`
  query GetWeights { weights { id weight_value log_date notes formatted_date } }
`;

const ADD_WEIGHT = gql`
  mutation AddWeight($input: WeightInput!) { addWeight(input: $input) { id weight_value log_date notes formatted_date } }
`;

const UPDATE_WEIGHT = gql`
  mutation UpdateWeight($id: ID!, $input: WeightInput!) { updateWeight(id: $id, input: $input) { id } }
`;

const DELETE_WEIGHT = gql`
  mutation DeleteWeight($id: ID!) { deleteWeight(id: $id) }
`;

const GET_NUTRITION_GOALS = gql`
  query GetActiveNutritionGoals { activeNutritionGoals { id calories protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg start_date end_date is_active } }
`;

const SET_NUTRITION_GOALS = gql`
  mutation SetNutritionGoals($input: NutritionGoalsInput!) { setNutritionGoals(input: $input) { id } }
`;

const GET_FOOD_ITEMS = gql`
  query GetFoodItems($search: String) { foodItems(search: $search) { id name brand serving_size serving_unit nutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg } barcode is_verified } }
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

const GET_MEALS = gql`
  query GetMeals($mealType: String) { meals(mealType: $mealType) { id name meal_type food_items { servings food_item_id { id name brand serving_size serving_unit nutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg } } } totalNutrition { calories_per_serving protein_grams carbs_grams fat_grams fiber_grams sugar_grams sodium_mg } } }
`;

const ADD_MEAL = gql`
  mutation AddMeal($input: MealInput!) { addMeal(input: $input) { id } }
`;

const UPDATE_MEAL = gql`
  mutation UpdateMeal($id: ID!, $input: MealInput!) { updateMeal(id: $id, input: $input) { id } }
`;

const DELETE_MEAL = gql`
  mutation DeleteMeal($id: ID!) { deleteMeal(id: $id) }
`;

const GET_MEDICATIONS = gql`
  query GetMedications { medications { id display_name is_supplement med_type rxcui ingredient_name brand_name form route strength dose_value dose_unit sig times_of_day suggested_indications user_indications supply_start_date days_supply notes } }
`;

const ADD_MEDICATION = gql`
  mutation AddMedication($input: MedicationInput!) { addMedication(input: $input) { id } }
`;

const UPDATE_MEDICATION = gql`
  mutation UpdateMedication($id: ID!, $input: MedicationInput!) { updateMedication(id: $id, input: $input) { id } }
`;

const DELETE_MEDICATION = gql`
  mutation DeleteMedication($id: ID!) { deleteMedication(id: $id) }
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

// Helper map to route Axios urls to GraphQL ops
function routeRequest(method, url, data) {
  // Normalize
  let base = url.split('?')[0];
  if (base.endsWith('/')) base = base.slice(0, -1);
  const parts = base.split('/').filter(Boolean);

  if (method === 'GET') {
    if (base === '/settings') return { query: GET_USER_SETTINGS };
    if (base === '/weight') return { query: GET_WEIGHTS };
    if (base === '/goals') return { query: GET_NUTRITION_GOALS };
    if (base === '/foods') return { query: GET_FOOD_ITEMS, variables: { search: url.includes('search=') ? new URLSearchParams(url.split('?')[1]).get('search') : null } };
    if (base === '/logs') {
      const sp = new URLSearchParams(url.split('?')[1]);
      return { query: GET_FOOD_LOGS, variables: { date: sp.get('date'), startDate: sp.get('startDate'), endDate: sp.get('endDate'), mealType: sp.get('mealType') } };
    }
    if (base.startsWith('/logs/')) return { query: GET_FOOD_LOGS, variables: { date: parts[1] } }; // /logs/YYYY-MM-DD
    if (base === '/meals') return { query: GET_MEALS };
    if (base.startsWith('/meals/')) return { query: GET_MEALS, variables: { mealType: parts[1] } };
    if (base === '/medications') return { query: GET_MEDICATIONS };
    if (base === '/bp') return { query: GET_BPS };

    // Fallbacks or unimplemented routes for mock REST
    logger.warn('GraphQL Migration: Unmapped GET route:', url);
    return null;
  }

  if (method === 'POST') {
    if (base === '/weight') return { mutation: ADD_WEIGHT, variables: { input: data } };
    if (base === '/goals') return { mutation: SET_NUTRITION_GOALS, variables: { input: data } };
    if (base === '/foods') return { mutation: ADD_FOOD_LOG, variables: { input: data } }; // /foods in old api sometimes meant log food
    if (base === '/logs') return { mutation: ADD_FOOD_LOG, variables: { input: data } };
    if (base === '/meals') return { mutation: ADD_MEAL, variables: { input: data } };
    if (base === '/medications') return { mutation: ADD_MEDICATION, variables: { input: data } };
    if (base === '/bp') return { mutation: ADD_BP, variables: { input: data } };

    // App settings updates via PUT/POST mixed
    if (base.startsWith('/settings/')) {
      // Just update all settings
      return { mutation: UPDATE_USER_SETTINGS, variables: { input: data } };
    }
    return null;
  }

  if (method === 'PUT') {
    const id = parts[1]; // /resource/:id
    if (base === '/settings') return { mutation: UPDATE_USER_SETTINGS, variables: { input: data } };
    if (parts[0] === 'settings') return { mutation: UPDATE_USER_SETTINGS, variables: { input: data } }; // /settings/dashboard etc
    if (parts[0] === 'weight') return { mutation: UPDATE_WEIGHT, variables: { id, input: data } };
    if (parts[0] === 'foods') return { mutation: UPDATE_FOOD_LOG, variables: { id, input: data } }; // Assuming foods route updates log
    if (parts[0] === 'logs') return { mutation: UPDATE_FOOD_LOG, variables: { id, input: data } };
    if (parts[0] === 'meals') return { mutation: UPDATE_MEAL, variables: { id, input: data } };
    if (parts[0] === 'medications') return { mutation: UPDATE_MEDICATION, variables: { id, input: data } };
    if (parts[0] === 'bp') return { mutation: UPDATE_BP, variables: { id, input: data } };
    return null;
  }

  if (method === 'DELETE') {
    const id = parts[1];
    if (parts[0] === 'weight') return { mutation: DELETE_WEIGHT, variables: { id } };
    if (parts[0] === 'foods') return { mutation: DELETE_FOOD_LOG, variables: { id } };
    if (parts[0] === 'logs') return { mutation: DELETE_FOOD_LOG, variables: { id } };
    if (parts[0] === 'meals') return { mutation: DELETE_MEAL, variables: { id } };
    if (parts[0] === 'medications') return { mutation: DELETE_MEDICATION, variables: { id } };
    if (parts[0] === 'bp') return { mutation: DELETE_BP, variables: { id } };
    return null;
  }

  return null;
}

// Emulate old Axios API structure, but bridge it under the hood to Apollo
export const apiService = {
  get: async (url, config) => {
    logger.debug('ApiService [Proxy] GET', url);
    const op = routeRequest('GET', url);
    if (!op) throw new Error(`Rest proxy gap: GET ${ url } not mapped to GraphQL.`);
    const res = await apolloClient.query({ ...op, fetchPolicy: 'no-cache' });
    // Attempt to automatically extract the root field the caller expects
    const keys = Object.keys(res.data || {});
    if (keys.length === 1) return res.data[keys[0]];
    return res.data;
  },

  post: async (url, data, config) => {
    logger.debug('ApiService [Proxy] POST', url);
    const op = routeRequest('POST', url, data);
    if (!op) throw new Error(`Rest proxy gap: POST ${ url } not mapped.`);
    const res = await apolloClient.mutate(op);
    const keys = Object.keys(res.data || {});
    if (keys.length === 1) return res.data[keys[0]];
    return res.data;
  },

  put: async (url, data, config) => {
    logger.debug('ApiService [Proxy] PUT', url);
    const op = routeRequest('PUT', url, data);
    if (!op) throw new Error(`Rest proxy gap: PUT ${ url } not mapped.`);
    const res = await apolloClient.mutate(op);
    const keys = Object.keys(res.data || {});
    if (keys.length === 1) return res.data[keys[0]];
    return res.data;
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
    if (keys.length === 1) return res.data[keys[0]];
    return res.data;
  }
};