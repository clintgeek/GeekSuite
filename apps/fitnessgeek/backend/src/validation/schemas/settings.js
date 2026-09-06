import { z } from 'zod';
import { stripMongoMeta } from './common.js';

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
// NO `household_id`, on either schema. It used to be accepted here because
// `PUT /` passed `household` through unfiltered — which meant a client could
// PUT any 12-hex household code and graft itself onto that household,
// bypassing the "leave before you join" check on `/household/join` and
// gaining member enumeration plus shared food-log reads. basegeek's gateway
// strips `household` from `updateFitnessUserSettings` for exactly this
// reason; `settingsRoutes.js` now does the same, and this schema refuses the
// id outright so an attempt is a loud 400 rather than a silent drop.
// (BURN_REVIEW #9.) Membership changes go through
// `/household/create|join|leave`; the share flags and display name go through
// `PUT /household` (householdPutSchema below).
const householdPutSchema = z.object({
  display_name: z.string().trim().max(100).optional(),
  share_food_logs: bool().optional(),
  share_weight: bool().optional(),
  share_meals: bool().optional(),
}).strict();

// The nested shape `PUT /` will *shape* (and then drop, see above) is the same
// one `PUT /household` writes — minus household_id on both, which is the point.
const householdNestedSchema = householdPutSchema;

// ---- PUT /api/settings ------------------------------------------------------
// Matches the `allowedFields` allow-list in settingsRoutes.js, plus
// `household` — which that route deliberately does NOT write (see the
// household note above). It stays here so a body that carries the share flags
// is still shaped and answered 200-with-no-household-write, exactly as the
// gateway answers it, instead of 400ing on an unrecognized key.
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

// ---- POST /api/settings/household/{create,join} -------------------------
// These two took their bodies completely raw. `household_id.toUpperCase()` on
// a non-string threw a TypeError the catch answered as a 500, and a non-string
// `display_name` reached mongoose and came back as a 500 too. Both are 400s.
const householdCreateSchema = z.object({
  display_name: z.string().trim().max(100).optional(),
}).strict();

const householdJoinSchema = z.object({
  // Deliberately just "a non-empty string, bounded". The bug being fixed is
  // that a NON-string reached `household_id.toUpperCase()` and threw, which the
  // route's catch answered as a 500; pinning the shape to the 12-hex code
  // `/household/create` mints would additionally lock out any code minted
  // before that format, and that is a product decision, not a bug fix.
  household_id: z.string().trim().min(1, 'household_id is required').max(64),
  display_name: z.string().trim().max(100).optional(),
}).strict();

const aiUpdateSchema = z.preprocess(stripMongoMeta, aiSchema);
const dashboardUpdateSchema = z.preprocess(stripMongoMeta, dashboardSchema);
const householdUpdateSchema = z.preprocess(stripMongoMeta, householdPutSchema);

export { settingsUpdateSchema, aiUpdateSchema, dashboardUpdateSchema, householdUpdateSchema, householdCreateSchema, householdJoinSchema };
export default { settingsUpdateSchema, aiUpdateSchema, dashboardUpdateSchema, householdUpdateSchema, householdCreateSchema, householdJoinSchema };
