const { z } = require('zod');
const { stripMongoMeta } = require('./common');

// Field set mirrors packages/schemas/fitnessgeek/userSettings.js — the
// single source of truth both fitnessgeek's REST routes and basegeek's
// GraphQL gateway build their models from (see that file's header for why).
// Every schema below is `.strict()`: a field this backend doesn't know about
// was previously silently dropped by Mongoose's strict-mode `$set` (per that
// file's own docs, that's the exact failure mode `nutrition_goal.mode` hit in
// April 2026) — now it's a 400 instead, at write time, where it's visible.

const bool = () => z.boolean();
const boundedNumber = (min, max) => z.coerce.number().min(min).max(max);
const dateOnlyString = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

// ---- dashboard --------------------------------------------------------------
// Matches the `allowedDashboardFields` allow-list already enforced in
// settingsRoutes.js's `PUT /dashboard`.
const dashboardSchema = z.object({
  show_current_weight: bool().optional(),
  show_blood_pressure: bool().optional(),
  show_calories_today: bool().optional(),
  show_login_streak: bool().optional(),
  show_nutrition_today: bool().optional(),
  show_garmin_summary: bool().optional(),
  show_quick_actions: bool().optional(),
  show_weight_goal: bool().optional(),
  show_nutrition_goal: bool().optional(),
  card_order: z.array(z.string().min(1).max(64)).max(20).optional(),
}).strict();

// ---- notifications ------------------------------------------------------
const notificationsSchema = z.object({
  enabled: bool().optional(),
  daily_reminder: bool().optional(),
  goal_reminders: bool().optional(),
}).strict();

// ---- units ----------------------------------------------------------------
const unitsSchema = z.object({
  weight: z.enum(['lbs', 'kg']).optional(),
  height: z.enum(['ft', 'cm']).optional(),
}).strict();

// ---- ai ---------------------------------------------------------------------
// Matches the `allowedAIFields` allow-list in `PUT /ai`.
const aiFeaturesSchema = z.object({
  natural_language_food_logging: bool().optional(),
  meal_suggestions: bool().optional(),
  nutrition_analysis: bool().optional(),
  goal_recommendations: bool().optional(),
}).strict();

const aiSchema = z.object({
  enabled: bool().optional(),
  features: aiFeaturesSchema.optional(),
}).strict();

// ---- garmin -------------------------------------------------------------
// PUT / already whitelists garmin down to these 3 keys before it ever
// touches Mongo (`garminAllowed = ['enabled','username','password']`) —
// oauth tokens and last_connected_at are server-written only. Mirror that
// exact allow-list here so a body carrying those read-only fields (a caller
// that spread the GET response) still 400s clearly instead of silently
// losing the extra keys further down.
const garminSchema = z.object({
  enabled: bool().optional(),
  username: z.string().max(255).optional(),
  password: z.string().max(255).optional(),
}).strict();

// ---- nutrition_goal -----------------------------------------------------
const ketoMacroSplitSchema = z.object({
  preset: z.enum(['classic', 'high_protein', 'lazy']).optional(),
  fat_pct: boundedNumber(0, 100).optional(),
  protein_pct: boundedNumber(0, 100).optional(),
  carb_pct: boundedNumber(0, 100).optional(),
}).strict();

const ketoSchema = z.object({
  net_carb_limit_g: boundedNumber(0, 500).optional(),
  track_net_carbs: bool().optional(),
  macro_split: ketoMacroSplitSchema.optional(),
}).strict();

const nutritionGoalSchema = z.object({
  enabled: bool().optional(),
  start_date: z.coerce.date().optional(),
  start_weight: boundedNumber(0, 2000).optional(),
  target_weight: boundedNumber(0, 2000).optional(),
  activity_level: z.string().max(50).optional(),
  weight_change_rate: boundedNumber(-10, 10).optional(),
  plan_type: z.enum(['standard', 'weekender', 'auto', 'fixed', 'weekly']).optional(),
  calorie_target_mode: z.enum(['auto', 'weekly', 'fixed', 'standard']).optional(),
  auto_base_calories: boundedNumber(0, 10000).optional(),
  fixed_calories: boundedNumber(0, 10000).optional(),
  activity_eatback_fraction: boundedNumber(0, 1).optional(),
  activity_eatback_cap_kcal: boundedNumber(0, 5000).optional(),
  protein_g_per_lb_goal: boundedNumber(0, 5).optional(),
  fat_g_per_lb_goal: boundedNumber(0, 5).optional(),
  goal_weight_lbs: boundedNumber(0, 2000).optional(),
  show_adjustment: bool().optional(),
  daily_calorie_target: boundedNumber(0, 10000).optional(),
  weekly_schedule: z.array(boundedNumber(0, 10000)).length(7).optional(),
  min_safe_calories: boundedNumber(0, 10000).optional(),
  bmr: boundedNumber(0, 10000).optional(),
  tdee: boundedNumber(0, 10000).optional(),
  timeline_weeks: boundedNumber(0, 520).optional(),
  estimated_end_date: z.coerce.date().optional(),
  mode: z.enum(['standard', 'keto']).optional(),
  keto: ketoSchema.optional(),
}).strict();

// ---- weight_goal ------------------------------------------------------------
const weightGoalSchema = z.object({
  enabled: bool().optional(),
  startWeight: boundedNumber(0, 2000).optional(),
  targetWeight: boundedNumber(0, 2000).optional(),
  startDate: dateOnlyString().optional(),
  goalDate: dateOnlyString().optional(),
  ratePerWeek: boundedNumber(-10, 10).optional(),
  lastRecalculated: dateOnlyString().optional(),
  unit: z.enum(['lbs', 'kg']).optional(),
  is_active: bool().optional(),
}).strict();

// ---- household ----------------------------------------------------------
// PUT / passes `household` through unfiltered today (unlike garmin, there is
// no local allow-list in that branch), so this nested shape includes
// household_id. The dedicated `PUT /household` route below never accepts
// household_id — you can't reassign your household code through it.
const householdNestedSchema = z.object({
  household_id: z.string().max(32).optional(),
  display_name: z.string().trim().max(100).optional(),
  share_food_logs: bool().optional(),
  share_weight: bool().optional(),
  share_meals: bool().optional(),
}).strict();

const householdPutSchema = z.object({
  display_name: z.string().trim().max(100).optional(),
  share_food_logs: bool().optional(),
  share_weight: bool().optional(),
  share_meals: bool().optional(),
}).strict();

// ---- PUT /api/settings ------------------------------------------------------
// Matches the `allowedFields` allow-list in settingsRoutes.js exactly.
const settingsUpdateSchema = z.preprocess(stripMongoMeta, z.object({
  dashboard: dashboardSchema.optional(),
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  notifications: notificationsSchema.optional(),
  units: unitsSchema.optional(),
  ai: aiSchema.optional(),
  nutrition_goal: nutritionGoalSchema.optional(),
  weight_goal: weightGoalSchema.optional(),
  garmin: garminSchema.optional(),
  household: householdNestedSchema.optional(),
}).strict());

const aiUpdateSchema = z.preprocess(stripMongoMeta, aiSchema);
const dashboardUpdateSchema = z.preprocess(stripMongoMeta, dashboardSchema);
const householdUpdateSchema = z.preprocess(stripMongoMeta, householdPutSchema);

module.exports = {
  settingsUpdateSchema,
  aiUpdateSchema,
  dashboardUpdateSchema,
  householdUpdateSchema,
};
