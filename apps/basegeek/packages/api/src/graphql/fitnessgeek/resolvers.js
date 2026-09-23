import { GraphQLScalarType, Kind } from 'graphql';
import crypto from 'crypto';
import logger from '../../lib/logger.js';
import { format, subDays } from 'date-fns';
import pkg from 'garmin-connect';
const { GarminConnect } = pkg;
import aiService from '../../services/aiService.js';
import UserSettings from './models/UserSettings.js';
import { resolveActiveNutritionGoal } from './nutritionGoalBridge.js';
import Weight from './models/Weight.js';
import NutritionGoals from './models/NutritionGoals.js';
import FoodItem from './models/FoodItem.js';
import FoodLog from './models/FoodLog.js';
import Meal from './models/Meal.js';
import Medication from './models/Medication.js';
import BloodPressure from './models/BloodPressure.js';
import LoginStreak from './models/LoginStreak.js';
import DailySummary from './models/DailySummary.js';
import WeightGoals from './models/WeightGoals.js';
import BodyComposition from './models/BodyComposition.js';
import { isValidObjectId } from './ownership.js';
import { toUtcMidnight, utcDateString, utcDayRange, utcMidnightToday } from '@geeksuite/utils/dates';
import {
  bodyCompCurrent,
  bodyCompChange,
  leanMassForTargets,
  katchMcArdleBMR,
  deriveMacroTargets,
} from '@geeksuite/utils';
import derivationModule from '@geeksuite/schemas/fitnessgeek/bodyCompositionDerivation';
import { leanMassFor, loadBodyCompScans, toBodyCompPoint } from './bodyCompPoints.js';
import { validateFitnessMealsArgs, validateParseFoodEntryArgs } from './validation.js';
import { runAIFeature } from '../../services/aiFeatureRunner.js';
import {
  QUICK_ADD_SCHEMA,
  QUICK_ADD_SYSTEM_PROMPT,
  deterministicParse,
  hourFromDateHint,
  isValidProposal,
  mealTypeForHour,
  normalizeProposal,
} from './quickAddParser.js';

/**
 * Daily ceiling for `parseFoodEntry`'s model call, per user. Food is logged
 * several times a day and a quick-add is one call per sentence, so this is
 * deliberately the loosest cap in the suite — a heavy logging day, not a
 * budget for a script.
 */
const QUICK_ADD_MAX_CALLS_PER_DAY = 40;

/** Escape every regex metacharacter so user input can only match literally. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Validate every food_item_id a client hands us before it is persisted onto a
 * meal or a log. Global catalog foods and the caller's own foods are allowed;
 * another user's private food is rejected, so a crafted id can't be used to
 * read back somebody else's nutrition data through a populated response.
 */
const assertAccessibleFoodItems = async (items, userId) => {
  const ids = (items || []).map((i) => i?.food_item_id).filter(Boolean);
  if (!ids.length) return;
  const unique = [...new Set(ids.map(String))];
  const found = await FoodItem.findAccessibleMany(unique, userId);
  if (found.length !== unique.length) throw new Error('Food item not found');
};

/**
 * Translate the GraphQL `FitnessFoodInput` shape (flat serving_size /
 * serving_unit) into the Mongoose FoodItem shape (nested serving.{size,unit})
 * that `FoodItem.findOrCreate` reads. Extra keys (`id`) are ignored by
 * findOrCreate, which only reads the fields it names.
 */
const toFoodItemDoc = (input = {}) => {
  const { serving_size, serving_unit, ...rest } = input;
  return {
    ...rest,
    serving: { size: serving_size ?? 100, unit: serving_unit || 'g' },
  };
};

/**
 * The calendar day a per-day read or recompute applies to.
 *
 * There is no defaulting here on purpose. This process runs in UTC (no image
 * installs tzdata, so `TZ=America/Chicago` is inert — BURN_REVIEW #13), so
 * `format(new Date(), 'yyyy-MM-dd')` is the *server's* day: between 19:00 and
 * midnight Central it is already tomorrow, and the client that asked for
 * "today" got an empty ring. Only the browser knows the user's calendar day,
 * and it already computes one (`localDateString()` /
 * `fitnessGeekService.toApiDate`) for every write. So the read demands it too:
 * a missing date is a caller bug, and it fails loudly rather than quietly
 * answering about the wrong day. (BURN_REVIEW #14.)
 *
 * @param {string} date  a client-supplied `YYYY-MM-DD`
 * @param {string} field the resolver name, for the error message
 * @returns {string} the same date
 */
const requireCalendarDate = (date, field) => {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  if (!date) {
    throw new Error(
      `${field} requires a date: the server cannot infer the caller's calendar day ` +
      '(it runs in UTC). Send localDateString() as `date` (YYYY-MM-DD).'
    );
  }
  throw new Error(`${field}: \`date\` must be a YYYY-MM-DD calendar date`);
};

/**
 * Sub-document paths under `UserSettings` whose value is a whole opaque blob
 * (`Schema.Types.Mixed`) and must be written as ONE value, not merged key by
 * key. `garmin.oauth1_token` / `oauth2_token` are Garmin's own token objects:
 * a partial merge would leave fields from a previous token alongside the new
 * one and hand a Frankenstein credential to the Garmin client.
 */
const SETTINGS_OPAQUE_PATHS = new Set(['garmin.oauth1_token', 'garmin.oauth2_token']);

const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/**
 * Flatten a nested `FitnessUserSettingsInput` into MongoDB dot paths, so
 * `$set` MERGES a sub-document instead of REPLACING it.
 *
 * `UserSettings.updateSettings` does `{ $set: updateData }` verbatim. Handed
 * `{garmin: {enabled: true, username: 'x'}}` — exactly what the Settings page
 * sends when the password box is left blank — MongoDB replaces the whole
 * `garmin` sub-document, deleting the encrypted `password`, both OAuth tokens
 * and `last_connected_at`. The same shape erased a whole `nutrition_goal`
 * (start/target weight, bmr, tdee, weekly_schedule, the keto block) on the
 * "Remove Goal" click, which sends `{nutrition_goal: {enabled: false}}`.
 * Dotted, that write touches `garmin.enabled` / `garmin.username` only.
 * (BURN_REVIEW #5. fitnessgeek's REST twin dots the same paths out —
 * `apps/fitnessgeek/backend/src/routes/settingsRoutes.js`.)
 *
 * Leaves — arrays (`dashboard.card_order`, `nutrition_goal.weekly_schedule`,
 * `favorite_foods`), Dates, scalars and the Mixed paths above — are set whole.
 * `undefined` values and empty objects are dropped: neither expresses an
 * intent MongoDB can act on, and `$set: {nutrition_goal: {}}` would reset the
 * sub-document to schema defaults, which is the very bug this prevents.
 *
 * Encryption still fires: the shared schema's `pre(findOneAndUpdate)` hook
 * rewrites `garmin.password` in BOTH the dot-path and the nested form — see
 * `encryptGarminPasswordIn` in @geeksuite/schemas/fitnessgeek/userSettings and
 * the `garminPasswordEncryption` suite that pins both shapes.
 *
 * @param {Object} input   the nested settings patch
 * @param {string} [prefix] internal — the dot path built so far
 * @param {Object} [out]    internal — the accumulator
 * @returns {Object} a flat `{ 'a.b.c': value }` map ready for `$set`
 */
export const flattenSettingsUpdate = (input, prefix = '', out = {}) => {
  for (const [key, value] of Object.entries(input || {})) {
    if (value === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && !SETTINGS_OPAQUE_PATHS.has(path)) {
      if (Object.keys(value).length) flattenSettingsUpdate(value, path, out);
      continue;
    }
    out[path] = value;
  }
  return out;
};

/**
 * Resolve the catalog row a food log should point at, matching REST
 * `POST /api/logs` (apps/fitnessgeek/backend/src/routes/logRoutes.js).
 *
 * A client may send either an existing `food_item_id` or a whole `food_item`
 * object. The object route is what every food *search* result needs:
 * `foodApiService` mints synthetic ids (`usda_<fdcId>`,
 * `openfoodfacts_<code>`), so there is no catalog row to point at yet.
 *
 *   - `food_item.id` (or `food_item_id`) that casts to an ObjectId → an
 *     existing row; look it up.
 *   - anything else with a `food_item` → `FoodItem.findOrCreate`, which
 *     dedupes on `barcode`, then `(source, source_id)`, then `(name, brand)`
 *     and otherwise creates a GLOBAL row (`user_id: null`).
 *
 * Unlike REST, the resolved row is then put through `findAccessible`: the
 * dedupe queries above are deliberately unscoped (that is how a global row is
 * shared), so without this a crafted `(name, brand)` could hand back another
 * user's PRIVATE custom food and populate it into the response.
 */
const resolveLogFoodItem = async (input, userId) => {
  const inline = input?.food_item;
  const inlineId = inline?.id ?? inline?._id;

  if (inline && !(inlineId && isValidObjectId(inlineId))) {
    const created = await FoodItem.findOrCreate(toFoodItemDoc(inline), userId);
    const accessible = created && await FoodItem.findAccessible(created._id, userId);
    if (!accessible) throw new Error('Food item not found');
    return accessible;
  }

  const id = inlineId ?? input?.food_item_id;
  const food = id ? await FoodItem.findAccessible(id, userId) : null;
  if (!food) throw new Error('Food item not found');
  return food;
};

// CommonJS module: default import + destructure (see models/BodyComposition.js).
const { derive } = derivationModule;

/**
 * The lean mass a target may use today, or null — and null, logged, when the
 * scan read itself fails. Every caller (derivedMacros, the goal bridge, the AI
 * context) has a documented no-scan behaviour — protein from goal weight — so
 * a failed body-comp read degrades to exactly that rather than taking the
 * Daily Ticket's macros down with it.
 *
 * @param {string} userId
 * @param {string|Date|null} [today] the caller's calendar day, if it sent one
 */
const leanMassOrNull = async (userId, today = null) => {
  try {
    return await leanMassFor(userId, today, { BodyComposition });
  } catch (err) {
    logger.warn({ err }, '[fitnessgeek] body-composition read failed; macros fall back to goal weight');
    return null;
  }
};

/** Bridge deps: the two goal stores plus the scan-based lean mass. */
const goalBridgeDeps = () => ({
  NutritionGoals,
  UserSettings,
  leanMassFor: (userId) => leanMassOrNull(userId),
});

/** A scan segment, or null when the scan carried no segmental data. */
const toSegment = (seg) => {
  const muscle = seg?.muscle_lb ?? null;
  const fat = seg?.fat_lb ?? null;
  return muscle === null && fat === null ? null : { muscle_lb: muscle, fat_lb: fat };
};

/**
 * A stored scan in the GraphQL `BodyComposition` shape: the primaries, the
 * five segments, the device name, and the subset of `derive()` the type
 * declares. Derived values are recomputed on read, never stored.
 */
const toBodyCompositionType = (doc) => {
  const d = derive(doc);
  return {
    id: String(doc._id),
    measured_at: doc.measured_at,
    log_date: doc.log_date,
    source: doc.source,
    weight_value: doc.weight_value,
    body_fat_mass_lb: doc.body_fat_mass_lb ?? null,
    body_water_l: doc.body_water_l ?? null,
    protein_lb: doc.protein_lb ?? null,
    bone_mass_lb: doc.bone_mass_lb ?? null,
    skeletal_muscle_lb: doc.skeletal_muscle_lb ?? null,
    subcutaneous_fat_lb: doc.subcutaneous_fat_lb ?? null,
    visceral_fat_index: doc.visceral_fat_index ?? null,
    height_cm: doc.height_cm ?? null,
    left_arm: toSegment(doc.left_arm),
    right_arm: toSegment(doc.right_arm),
    trunk: toSegment(doc.trunk),
    left_leg: toSegment(doc.left_leg),
    right_leg: toSegment(doc.right_leg),
    device_name: doc.device?.name ?? null,
    derived: {
      fat_free_mass_lb: d.fat_free_mass_lb,
      body_fat_pct: d.body_fat_pct,
      body_water_pct: d.body_water_pct,
      skeletal_muscle_pct: d.skeletal_muscle_pct,
      bmr_kcal: d.bmr_kcal,
      bmi: d.bmi,
      smi: d.smi,
    },
  };
};

/**
 * The BMR a plan made on `today` would use (plan D1): Katch-McArdle from the
 * 14-day mean lean mass while the latest scan is ≤ 30 days old, else
 * 'mifflin' with a null value — Mifflin needs profile inputs (age, height,
 * sex) the planner holds and the gateway does not.
 */
const bmrFromPoints = (points, today) => {
  const lean = leanMassForTargets(points, { today });
  if (!lean) return { bmr: null, source: 'mifflin', lean_mass_lb: null, scans: 0, scan_age_days: null };
  return {
    bmr: katchMcArdleBMR({ leanMassLb: lean.lean_mass_lb }),
    source: 'scan',
    lean_mass_lb: lean.lean_mass_lb,
    scans: lean.scans,
    scan_age_days: lean.age_days,
  };
};

// FitnessJSON scalar — arbitrary JSON passthrough for settings sub-objects
const FitnessJSONScalar = new GraphQLScalarType({
  name: 'FitnessJSON',
  description: 'Arbitrary JSON for FitnessGeek settings sub-objects',
  parseValue: (value) => value,
  serialize: (value) => value,
  parseLiteral: (ast) => ast.value,
});

// --- Report Helpers ---

// `sodium` (mg) and `net_carbs` (g) joined 2026-09-23 (TRENDS_PLAN D6): both
// were on every log and in the dashboard's daily summary, and Reports never
// showed either.
const METRICS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium', 'net_carbs'];

/** `{ calories: 0, protein: 0, ... }` for every metric. */
const zeroMetrics = () => Object.fromEntries(METRICS.map((m) => [m, 0]));

const calcNutrition = (log) => {
  const servings = log.servings || 1;
  const stored = log.nutrition || {};
  const fallback = (log.food_item_id && typeof log.food_item_id === 'object') ? log.food_item_id.nutrition || {} : {};
  const per = (field) => stored[field] ?? fallback[field] ?? 0;
  return {
    calories: per('calories_per_serving') * servings,
    protein: per('protein_grams') * servings,
    carbs: per('carbs_grams') * servings,
    fat: per('fat_grams') * servings,
    fiber: per('fiber_grams') * servings,
    sugar: per('sugar_grams') * servings,
    sodium: per('sodium_mg') * servings,
    // Carbs less fiber, floored per log — the same rule as the daily
    // summary's net_carbs_grams (@geeksuite/schemas dailySummary.js), so the
    // report and the dashboard can't disagree about the same day.
    net_carbs: Math.max(0, per('carbs_grams') - per('fiber_grams')) * servings,
  };
};

const buildDaily = (logs) => {
  const map = new Map();
  logs.forEach(log => {
    const dateKey = new Date(log.log_date).toISOString().split('T')[0];
    if (!map.has(dateKey)) {
      map.set(dateKey, { date: dateKey, ...zeroMetrics(), entries: 0 });
    }
    const day = map.get(dateKey);
    const nutrition = calcNutrition(log);
    METRICS.forEach(metric => { day[metric] += nutrition[metric]; });
    day.entries += 1;
  });
  return Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
};

const sumTotals = (daily) => {
  const totals = zeroMetrics();
  daily.forEach(day => {
    METRICS.forEach(metric => { totals[metric] += day[metric]; });
  });
  return totals;
};

const toAverages = (totals, days) => {
  if (!days) return zeroMetrics();
  const averages = {};
  METRICS.forEach(metric => {
    averages[metric] = Math.round((totals[metric] / days) * 10) / 10;
  });
  return averages;
};

const mealBreakdown = (logs) => {
  const meals = {};
  logs.forEach(log => {
    if (!meals[log.meal_type]) {
      meals[log.meal_type] = { ...zeroMetrics(), count: 0 };
    }
    const stats = meals[log.meal_type];
    const nutrition = calcNutrition(log);
    METRICS.forEach(metric => { stats[metric] += nutrition[metric]; });
    stats.count += 1;
  });
  return meals;
};

const topFoods = (logs) => {
  const map = new Map();
  logs.forEach(log => {
    const name = log.food_item_id?.name || log.food_name || 'Unknown';
    if (!map.has(name)) map.set(name, { name, count: 0, calories: 0 });
    const item = map.get(name);
    const nutrition = calcNutrition(log);
    item.count += 1;
    item.calories += nutrition.calories;
  });
  return Array.from(map.values()).sort((a, b) => b.count - a.count || b.calories - a.calories).slice(0, 10);
};

const goalKeyForMetric = (metric) => {
  switch (metric) {
    case 'calories': return 'calories';
    case 'protein': return 'protein_grams';
    case 'carbs': return 'carbs_grams';
    case 'fat': return 'fat_grams';
    case 'fiber': return 'fiber_grams';
    case 'sugar': return 'sugar_grams';
    default: return metric;
  }
};

const rollingAverage = (daily, window) => {
  const results = [];
  daily.forEach((day, idx) => {
    const slice = daily.slice(Math.max(0, idx - window + 1), idx + 1);
    const avg = toAverages(sumTotals(slice), slice.length);
    results.push({ date: day.date, ...avg });
  });
  return results;
};

/**
 * Plain-language highlights for the trends report (and, through
 * `fitnessInsightsTrendWatch`, for the model).
 *
 * Both used to compare ONE day against ONE day — the period's first and last
 * — so a single big dinner, or a single salty-water morning, became "calorie
 * intake increased 20%" or "weight changed by 2.4 lbs". Now both compare the
 * first 7 days' mean with the last 7 days' mean (DOCS/FITNESSGEEK_BODY_DATA_PLAN.md
 * §0); weight goes through the same `bodyCompChange` as the body page, so it
 * says nothing until the two windows are about two weeks apart.
 */
export const trendHighlights = (daily, weights) => {
  const highlights = [];
  const logged = (daily || []).filter((d) => d.calories > 0);
  if (logged.length >= 14) {
    const mean = (xs) => xs.reduce((a, d) => a + d.calories, 0) / xs.length;
    const early = mean(logged.slice(0, 7));
    const late = mean(logged.slice(-7));
    if (early > 0 && late > early * 1.2) {
      highlights.push('Average daily calories in the last week were more than 20% above the first week.');
    }
  }
  if (weights?.length >= 2) {
    const change = bodyCompChange(weights.map((w) => ({ date: w.date, weight_lb: w.weight })));
    if (change.available && change.weight_change_lb !== null && Math.abs(change.weight_change_lb) >= 2) {
      highlights.push(
        `Weight changed by ${ change.weight_change_lb.toFixed(1) } lbs (7-day average vs 7-day average).`,
      );
    }
  }
  return highlights;
};

// --- AI Context Helpers ---

const getFoodLogContext = async (userId, startDate, endDate) => {
  const logs = await FoodLog.find({ user_id: userId, log_date: { $gte: startDate, $lte: endDate } }).populate('food_item_id').lean();
  if (!logs.length) return null;
  const dailyTotals = {};
  const mealTiming = { breakfast: [], lunch: [], dinner: [], snack: [] };
  const alcoholDays = new Set();
  logs.forEach(log => {
    const dateKey = new Date(log.log_date).toISOString().split('T')[0];
    const nutrition = calcNutrition(log);
    if (!dailyTotals[dateKey]) dailyTotals[dateKey] = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
    dailyTotals[dateKey].calories += nutrition.calories;
    dailyTotals[dateKey].protein += nutrition.protein;
    dailyTotals[dateKey].carbs += nutrition.carbs;
    dailyTotals[dateKey].fat += nutrition.fat;
    dailyTotals[dateKey].fiber += nutrition.fiber;
    dailyTotals[dateKey].sugar += nutrition.sugar;
    if (log.meal_type && mealTiming[log.meal_type]) mealTiming[log.meal_type].push(dateKey);
    const foodName = (log.food_name || log.food_item_id?.name || '').toLowerCase();
    if (foodName.match(/beer|wine|whiskey|vodka|cocktail|alcohol|margarita|tequila/)) alcoholDays.add(dateKey);
  });
  const days = Object.keys(dailyTotals).length;
  const totals = Object.values(dailyTotals);
  return {
    daysLogged: days,
    totalEntries: logs.length,
    dailyTotals,
    averages: {
      calories: Math.round(totals.reduce((s, d) => s + d.calories, 0) / days),
      protein: Math.round(totals.reduce((s, d) => s + d.protein, 0) / days),
      carbs: Math.round(totals.reduce((s, d) => s + d.carbs, 0) / days),
      fat: Math.round(totals.reduce((s, d) => s + d.fat, 0) / days),
      fiber: Math.round(totals.reduce((s, d) => s + d.fiber, 0) / days),
      sugar: Math.round(totals.reduce((s, d) => s + d.sugar, 0) / days)
    },
    alcoholDays: Array.from(alcoholDays),
    mealConsistency: {
      breakfast: mealTiming.breakfast.length,
      lunch: mealTiming.lunch.length,
      dinner: mealTiming.dinner.length,
      snack: mealTiming.snack.length
    }
  };
};

/** Days of weigh-ins the AI weight trend looks back over, whatever the window. */
const WEIGHT_TREND_LOOKBACK_DAYS = 28;

/**
 * One weight per calendar day: the most recently written row for each
 * `log_date` day wins. `addFitnessWeight` now keeps one row per day (plan D8),
 * but rows written before that — and any race — can still leave two, and a
 * summary that counts a day twice weights it twice.
 *
 * @param {Array<Object>} rows lean Weight rows
 * @returns {Array<Object>} one row per day, oldest day first
 */
export const onePerDay = (rows) => {
  const byDay = new Map();
  const stamp = (r) => new Date(r.updated_at || r.created_at || 0).getTime();
  for (const r of rows || []) {
    const day = utcDateString(r.log_date);
    if (!day) continue;
    const held = byDay.get(day);
    if (!held || stamp(r) >= stamp(held)) byDay.set(day, r);
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, r]) => r);
};

/**
 * Weight, for the AI coach.
 *
 * THE TREND IS SMOOTHED (plan §0, finding F8). It used to be the first raw
 * weight in the window against the last — so a salty dinner the night before
 * the window closed told the coach the user was "gaining". Now it is the
 * 7-day mean of the latest weigh-ins against the 7-day mean of the earliest,
 * over the last 28 days whatever the window (a 1-day morning brief still
 * gets a real trend), through the same `bodyCompChange` the body-comp page
 * uses: the two windows never overlap and their centres must be ≥ 14 days
 * apart. Short of that, `trend` is 'insufficient_data', `change` is null, and
 * `trendNote` says why — never a number built from two readings.
 *
 * `entries` / `current` / `min` / `max` / `average` describe the window
 * itself, over one weight per day.
 */
const getWeightContext = async (userId, startDate, endDate) => {
  const anchor = toUtcMidnight(endDate);
  const trendStart = new Date(anchor.getTime() - (WEIGHT_TREND_LOOKBACK_DAYS - 1) * 86400000);
  const from = trendStart < startDate ? trendStart : startDate;
  const raw = await Weight.find({ userId: userId, log_date: { $gte: from, $lte: endDate } }).sort({ log_date: 1 }).lean();
  const days = onePerDay(raw);
  if (!days.length) return null;

  const inWindow = days.filter((w) => w.log_date >= startDate && w.log_date <= endDate);
  const trendDays = days.filter((w) => w.log_date >= trendStart);
  const change = bodyCompChange(trendDays.map((w) => ({ date: w.log_date, weight_lb: w.weight_value })));

  const summaryWindow = (w) => (w ? {
    from: utcDateString(w.from),
    to: utcDateString(w.to),
    weighIns: w.scans,
    mean: w.weight_lb,
  } : null);

  let trend = 'insufficient_data';
  let delta = null;
  if (change.available && change.weight_change_lb !== null) {
    delta = change.weight_change_lb;
    trend = delta < -0.5 ? 'losing' : delta > 0.5 ? 'gaining' : 'stable';
  }

  const values = inWindow.map((w) => w.weight_value);
  const latest7 = change.available ? change.latest : null;
  return {
    entries: inWindow.length,
    current: values.length ? values[values.length - 1] : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null,
    // Smoothed: 7-day mean vs 7-day mean, lb. Null unless `trend` is a direction.
    change: delta,
    trend,
    trendBasis: change.available
      ? {
        method: `7-day mean vs 7-day mean over the last ${WEIGHT_TREND_LOOKBACK_DAYS} days`,
        gapDays: change.gap_days,
        earlier: summaryWindow(change.baseline),
        recent: summaryWindow(latest7),
      }
      : null,
    trendNote: change.available
      ? 'Daily weight swings 2-3 lb with water and food; reason from the 7-day means, not from individual readings.'
      : `Not enough weigh-ins spread over the last ${WEIGHT_TREND_LOOKBACK_DAYS} days for a smoothed trend ` +
        '(it needs two 7-day windows about two weeks apart). Do not infer a trend from individual readings.',
  };
};

/**
 * Body composition, for the AI coach — averages only (plan §0): the 14-day
 * current means, the 7-day-vs-7-day change or when it will exist, and the BMR
 * a plan made today would use. Null when the user has no scans.
 *
 * @param {string} userId
 * @param {Date} endDate the context's last instant; scans after it are ignored
 */
const getBodyCompContext = async (userId, endDate) => {
  const docs = await loadBodyCompScans(userId, { BodyComposition }, { through: endDate });
  if (!docs.length) return null;
  const points = docs.map(toBodyCompPoint);
  const current = bodyCompCurrent(points);
  const change = bodyCompChange(points);
  const { bmr, source } = bmrFromPoints(points, toUtcMidnight(endDate));
  const { from, to, ...means } = current;
  return {
    current: { from: utcDateString(from), to: utcDateString(to), ...means },
    change: change.available
      ? {
        available: true,
        gap_days: change.gap_days,
        baseline: { from: utcDateString(change.baseline.from), to: utcDateString(change.baseline.to), scans: change.baseline.scans },
        latest: { from: utcDateString(change.latest.from), to: utcDateString(change.latest.to), scans: change.latest.scans },
        weight_change_lb: change.weight_change_lb,
        fat_change_lb: change.fat_change_lb,
        lean_change_lb: change.lean_change_lb,
      }
      : { available: false, available_from: utcDateString(change.available_from) || null },
    bmr: { source, value: bmr },
    note: 'Bioimpedance body composition; individual scans swing 1-2% body fat with hydration — reason only from these averages, never from a single scan.',
  };
};

const getBPContext = async (userId, startDate, endDate) => {
  const readings = await BloodPressure.find({ userId: userId, log_date: { $gte: startDate, $lte: endDate } }).sort({ log_date: -1 }).lean();
  if (!readings.length) return null;
  const systolics = readings.map(r => r.systolic);
  const diastolics = readings.map(r => r.diastolic);
  const avgSystolic = Math.round(systolics.reduce((a, b) => a + b, 0) / systolics.length);
  const avgDiastolic = Math.round(diastolics.reduce((a, b) => a + b, 0) / diastolics.length);
  let category = 'normal';
  if (avgSystolic >= 180 || avgDiastolic >= 120) category = 'crisis';
  else if (avgSystolic >= 140 || avgDiastolic >= 90) category = 'stage2';
  else if (avgSystolic >= 130 || avgDiastolic >= 80) category = 'stage1';
  else if (avgSystolic >= 120) category = 'elevated';
  return {
    entries: readings.length,
    latest: { systolic: readings[0].systolic, diastolic: readings[0].diastolic },
    average: { systolic: avgSystolic, diastolic: avgDiastolic },
    category
  };
};

/**
 * Gather the AI-insight context for a window of days ending on `options.date`
 * (a calendar day; defaults to the server's today — see BURN_REVIEW #14, which
 * tracks the server-clock half of this).
 *
 * The window is built from WHOLE UTC DAYS. It used to be
 * `new Date()` back to `subDays(new Date(), daysBack)`, which carries a time
 * of day — and every row this reads (`log_date`, `Weight.log_date`,
 * `BloodPressure.log_date`) is a calendar date stored at UTC midnight. So the
 * oldest day in the window sat *below* the floor and was silently dropped:
 * `fitnessInsightsMorningBrief` asks for `daysBack: 1` and is prompted
 * "based on yesterday's data", but yesterday's 00:00Z rows never matched, and
 * at 07:00 the coach was handed an empty day.
 */
const buildUserContext = async (userId, options = {}) => {
  const daysBack = options.daysBack || 7;
  const anchor = options.date ? toUtcMidnight(options.date) : toUtcMidnight(new Date());
  const startDate = toUtcMidnight(subDays(anchor, daysBack));
  const { end: endDate } = utcDayRange(anchor);
  const context = {
    dateRange: { start: utcDateString(startDate), end: utcDateString(endDate), days: daysBack },
    generatedAt: new Date().toISOString()
  };
  const [nutrition, weight, bloodPressure, bodyComposition, goals] = await Promise.allSettled([
    getFoodLogContext(userId, startDate, endDate),
    getWeightContext(userId, startDate, endDate),
    getBPContext(userId, startDate, endDate),
    getBodyCompContext(userId, endDate),
    Promise.all([
      // Bridged — see nutritionGoalBridge.js. Before this, every AI insight
      // reasoned about a user whose targets it could not see, and said so to
      // no one.
      resolveActiveNutritionGoal(userId, goalBridgeDeps()),
      WeightGoals.getActiveWeightGoals(userId),
    ])
  ]);
  context.nutrition = nutrition.status === 'fulfilled' ? nutrition.value : null;
  context.weight = weight.status === 'fulfilled' ? weight.value : null;
  context.bloodPressure = bloodPressure.status === 'fulfilled' ? bloodPressure.value : null;
  // Every insight prompt serializes this whole object (JSON.stringify), so
  // this key reaches the model as-is — note and all.
  context.bodyComposition = bodyComposition.status === 'fulfilled' ? bodyComposition.value : null;
  if (goals.status === 'fulfilled') {
    const [ng, wg] = goals.value;
    context.goals = {
      nutrition: ng ? { calories: ng.calories, protein: ng.protein_grams, carbs: ng.carbs_grams, fat: ng.fat_grams, fiber: ng.fiber_grams } : null,
      weight: wg ? { enabled: wg.is_active, startWeight: wg.startWeight, targetWeight: wg.targetWeight, goalDate: wg.goalDate } : null
    };
  }
  return context;
};

// --- Garmin Helpers ---

async function buildGarminClient(userId) {
  const settings = await UserSettings.getOrCreate(userId);
  if (!settings.garmin || !settings.garmin.enabled) throw new Error('Garmin integration disabled');
  const client = new GarminConnect({ username: settings.garmin.username, password: settings.garmin.password });
  if (settings.garmin.oauth1_token && settings.garmin.oauth2_token) {
    try { client.loadToken(settings.garmin.oauth1_token, settings.garmin.oauth2_token); return { client, settings }; }
    catch (err) { logger.warn({ err }, 'Failed to load saved Garmin tokens'); }
  }
  await client.login();
  await persistGarminTokens(userId, client);
  return { client, settings };
}

async function persistGarminTokens(userId, client) {
  const oauth1 = client.client?.oauth1Token;
  const oauth2 = client.client?.oauth2Token;
  if (oauth1 && oauth2) {
    await UserSettings.findOneAndUpdate({ user_id: userId }, { $set: { 'garmin.oauth1_token': oauth1, 'garmin.oauth2_token': oauth2, 'garmin.last_connected_at': new Date() } });
  }
}

export const resolvers = {
  FitnessJSON: FitnessJSONScalar,

  Query: {
    fitnessUserSettings: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      
      const [settings, centralUser] = await Promise.all([
        UserSettings.getOrCreate(user.id).then(s => s.populate('favorite_foods')),
        import('../../models/user.js').then(m => m.User.findById(user.id))
      ]);

      // Overlay central theme if available
      const santizedSettings = settings.toObject();
      if (centralUser?.preferences?.theme) {
        santizedSettings.theme = centralUser.preferences.theme;
      }
      
      return santizedSettings;
    },
    fitnessWeights: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return Weight.find({ userId: user.id }).sort({ log_date: -1 });
    },
    fitnessWeight: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return Weight.findOne({ _id: id, userId: user.id });
    },
    activeNutritionGoals: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      // Via the bridge: the live UI only ever writes
      // `UserSettings.nutrition_goal`, so querying `nutritiongoals` alone
      // returned null for every user (that collection held 0 documents on
      // 2026-09-20). See nutritionGoalBridge.js.
      return resolveActiveNutritionGoal(user.id, goalBridgeDeps());
    },
    nutritionGoalsHistory: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return NutritionGoals.find({ user_id: user.id }).sort({ start_date: -1 });
    },
    fitnessFoods: async (_, { search }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const query = {
        $or: [{ user_id: user.id }, { user_id: null }, { user_id: { $exists: false } }],
        is_deleted: false,
      };
      // The search box's raw text reaches mongod as a regex. Unescaped, a
      // perfectly ordinary food name broke the search — `Oreo (` threw
      // "Unterminated group" out of the resolver, and `c++` / `50%+` / `*`
      // the same way — and a crafted `(a+)+$` was a ReDoS evaluated per
      // document. Escaped, the value can only ever mean itself.
      if (search) query.name = new RegExp(escapeRegex(search), 'i');
      return FoodItem.find(query).sort({ name: 1 }).limit(100);
    },
    fitnessFood: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      // Shared catalog read: global foods stay visible to everyone, but another
      // user's private custom food resolves to null.
      return FoodItem.findAccessible(id, user.id);
    },
    foodLogs: async (_, { date, startDate, endDate, mealType }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      if (date) {
        if (mealType) return FoodLog.getLogsByMealType(user.id, mealType, date);
        return FoodLog.getLogsForDate(user.id, date);
      } else if (startDate && endDate) {
        return FoodLog.getLogsForDateRange(user.id, startDate, endDate);
      }
      return FoodLog.getRecentLogs(user.id, 50);
    },
    foodLog: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      if (!isValidObjectId(id)) return null;
      return FoodLog.findOne({ _id: id, user_id: user.id }).populate('food_item_id');
    },
    fitnessMeals: async (_, { mealType, search }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const args = validateFitnessMealsArgs({ mealType, search });
      // Same rule as `fitnessFoods` above: the search box's raw text reaches
      // mongod as a regex, escaped so it can only ever match itself
      // (BURN_REVIEW_2 #13 — `getMeals(mealType, search)`'s `search` used to
      // be dropped by the frontend router before it ever reached here, so
      // meal search silently returned every saved meal).
      if (args.search) {
        const query = {
          user_id: user.id,
          is_deleted: false,
          name: new RegExp(escapeRegex(args.search), 'i'),
        };
        if (args.mealType) query.meal_type = args.mealType;
        return Meal.find(query).populate('food_items.food_item_id').sort({ name: 1 });
      }
      if (args.mealType) return Meal.getMealsByType(args.mealType, user.id);
      return Meal.getActiveMeals(user.id);
    },
    fitnessMeal: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const meal = await Meal.findOwned(id, user.id);
      return meal ? meal.populate('food_items.food_item_id') : null;
    },
    fitnessMedications: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return Medication.find({ user_id: user.id }).sort({ display_name: 1 });
    },
    fitnessMedication: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return Medication.findOne({ _id: id, user_id: user.id });
    },
    bloodPressures: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return BloodPressure.find({ userId: user.id }).sort({ log_date: -1 });
    },
    bloodPressure: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return BloodPressure.findOne({ _id: id, userId: user.id });
    },

    loginStreak: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const streak = await LoginStreak.getOrCreateStreak(user.id);
      return {
        currentStreak: streak.current_streak,
        longestStreak: streak.longest_streak,
        lastLoginDate: streak.last_login_date ? streak.last_login_date.toISOString().split('T')[0] : null,
        streakStartDate: streak.streak_start_date ? streak.streak_start_date.toISOString().split('T')[0] : null,
      };
    },

    dailySummary: async (_, { date }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const targetDate = requireCalendarDate(date, 'dailySummary');
      const settings = await UserSettings.findOne({ user_id: user.id });
      const calorieGoal = settings?.nutrition_goal?.daily_calorie_target || null;
      const summary = await DailySummary.updateFromLogs(user.id, targetDate);
      return {
        date: targetDate,
        totals: summary.totals,
        meals: summary.meals,
        calorieGoal,
      };
    },

    weeklySummary: async (_, { startDate }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const start = new Date(startDate);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      const summaries = await DailySummary.getSummaryRange(user.id, start, end);
      const weeklyTotals = { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 };
      summaries.forEach(s => {
        weeklyTotals.calories += s.totals.calories;
        weeklyTotals.protein_grams += s.totals.protein_grams;
        weeklyTotals.carbs_grams += s.totals.carbs_grams;
        weeklyTotals.fat_grams += s.totals.fat_grams;
      });
      return {
        start_date: start.toISOString().split('T')[0],
        end_date: end.toISOString().split('T')[0],
        daily_summaries: summaries,
        weekly_totals: weeklyTotals,
        average_daily_calories: Math.round(weeklyTotals.calories / 7),
      };
    },

    derivedMacros: async (_, { date } = {}, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);
      const ng = settings?.nutrition_goal || {};

      // The arithmetic lives in @geeksuite/utils (plan D5) — the same
      // `deriveMacroTargets` the goal bridge and REST `/goals/nutrition/macros`
      // use. With a scan ≤ 30 days old, protein is per lb of measured lean
      // mass (D3); keto plans get keto macros (D4). No scan, standard mode:
      // byte-identical to the inline copy this replaced.
      const calendarDay = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
      const lean = await leanMassOrNull(user.id, calendarDay);
      const { rules, fixed, calories, weekly } = deriveMacroTargets(ng, { leanMassLb: lean?.lean_mass_lb ?? null });

      // WHICH DAY IS IT FOR THE USER?
      //
      // `new Date().getDay()` is the SERVER's weekday, and the containers run
      // UTC — so on a weekly schedule the target flipped to the next day's
      // number at 19:00 US-Central (18:00 CST): at 18:59 a Sunday allowance,
      // at 19:00 Monday's, telling the user they were hundreds of calories
      // over with five hours of their Sunday left. Invisible in fixed mode,
      // where all seven entries are equal, which is why it survived.
      //
      // `date` is the caller's own local calendar day. A bare `YYYY-MM-DD`
      // is read with `getUTC*` here because that is how the platform parses
      // it — as UTC midnight — so this stays a pure calendar calculation and
      // never touches the server's zone. The `new Date()` fallback is for
      // callers that send nothing, and is the old, wrong-in-the-evening
      // behaviour by necessity: a server cannot know a user's day.
      const parsed = date ? new Date(`${date}T00:00:00.000Z`) : null;
      const usable = parsed && !Number.isNaN(parsed.getTime());
      const dow = usable ? parsed.getUTCDay() : new Date().getDay();
      const todayIndex = (dow + 6) % 7;
      const today = weekly[todayIndex] || null;

      return { rules, fixed, calories, weekly, today, todayIndex };
    },

    bodyCompositions: async (_, { startDate, endDate } = {}, { user }) => {
      if (!user) throw new Error('Unauthorized');
      // Calendar days, inclusive at both ends, read in UTC — `log_date` is
      // stored at UTC midnight, so a server-local day boundary would drop or
      // add a day the moment the container got a TZ.
      const query = { userId: user.id };
      if (startDate || endDate) {
        query.log_date = {};
        if (startDate) query.log_date.$gte = toUtcMidnight(startDate);
        if (endDate) query.log_date.$lte = utcDayRange(endDate).end;
      }
      const docs = await BodyComposition.find(query).sort({ measured_at: 1 }).lean();
      return docs.map(toBodyCompositionType);
    },

    bodyCompositionSummary: async (_, { date } = {}, { user }) => {
      if (!user) throw new Error('Unauthorized');
      // Optional, unlike dailySummary's: it only ages the latest scan for
      // `bmr`, where UTC's today is within the 30-day tolerance. But a value
      // that IS sent must be a calendar date, not silently misread.
      if (date != null && date !== '') requireCalendarDate(date, 'bodyCompositionSummary');
      const docs = await loadBodyCompScans(user.id, { BodyComposition });
      const points = docs.map(toBodyCompPoint);
      return {
        total_scans: docs.length,
        first_scan_at: docs.length ? docs[0].measured_at : null,
        latest_scan_at: docs.length ? docs[docs.length - 1].measured_at : null,
        current: bodyCompCurrent(points),
        change: bodyCompChange(points),
        bmr: bmrFromPoints(points, date || utcMidnightToday()),
      };
    },

    fitnessHousehold: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);

      let members = [];
      if (settings.household?.household_id) {
        const householdMembers = await UserSettings.find({
          'household.household_id': settings.household.household_id,
          user_id: { $ne: user.id }
        }).select('user_id household.display_name household.share_food_logs household.share_meals');

        members = householdMembers.map(m => ({
          user_id: m.user_id,
          display_name: m.household?.display_name || 'Household Member',
          shares_food_logs: m.household?.share_food_logs || false,
          shares_meals: m.household?.share_meals || false
        }));
      }

      return {
        household_id: settings.household?.household_id || null,
        display_name: settings.household?.display_name || null,
        share_food_logs: settings.household?.share_food_logs ?? true,
        share_weight: settings.household?.share_weight ?? false,
        share_meals: settings.household?.share_meals ?? true,
        members
      };
    },

    fitnessHouseholdMemberLogs: async (_, { memberId, date }, { user }) => {
      if (!user) throw new Error('Unauthorized');

      const [userSettings, memberSettings] = await Promise.all([
        UserSettings.getOrCreate(user.id),
        UserSettings.findOne({ user_id: memberId })
      ]);

      if (!userSettings.household?.household_id) throw new Error('You are not part of a household');
      if (!memberSettings?.household?.household_id || memberSettings.household.household_id !== userSettings.household.household_id) {
        throw new Error('User is not in your household');
      }
      if (!memberSettings.household.share_food_logs) throw new Error('This household member has not enabled food log sharing');

      return FoodLog.getLogsForDate(memberId, date);
    },

    fitnessFoodReportOverview: async (_, { start, days = 7 }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const startDate = start ? new Date(start) : subDays(new Date(), days - 1);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + (days - 1));
      endDate.setUTCHours(23, 59, 59, 999);
      const logs = await FoodLog.find({ user_id: user.id, log_date: { $gte: startDate, $lte: endDate } }).populate('food_item_id').lean();
      const daily = buildDaily(logs);
      const totals = sumTotals(daily);
      const averages = toAverages(totals, daily.length);
      const meals = mealBreakdown(logs);
      const top = topFoods(logs);
      const goals = await resolveActiveNutritionGoal(user.id, goalBridgeDeps());
      const goalCompliance = {};
      if (goals) {
        METRICS.forEach(metric => {
          const goalKey = goalKeyForMetric(metric);
          const goalValue = goals[goalKey];
          if (!goalValue) return;
          const daysWithin = daily.filter(day => day[metric] >= 0.95 * goalValue && day[metric] <= 1.05 * goalValue).length;
          goalCompliance[metric] = { goal: goalValue, daysWithin, percentage: daily.length ? Math.round((daysWithin / daily.length) * 100) : 0 };
        });
      }
      // The day ribbon colours each day against these. Reports.jsx has always
      // read `targets`, and nothing ever returned it — so the ribbon's
      // compliance edges, macro fills and legend never once rendered
      // (found 2026-09-23). Same goal the compliance above is graded against.
      let targets = null;
      if (goals) {
        const t = {
          calories: goals.calories, protein: goals.protein_grams, carbs: goals.carbs_grams,
          fat: goals.fat_grams, fiber: goals.fiber_grams,
        };
        targets = Object.fromEntries(Object.entries(t).filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0));
        if (!Object.keys(targets).length) targets = null;
      }
      return {
        range: { start: format(startDate, 'yyyy-MM-dd'), end: format(endDate, 'yyyy-MM-dd'), days },
        totals, averages, daily, meals, topFoods: top,
        goalCompliance: Object.keys(goalCompliance).length ? goalCompliance : null,
        targets,
        // `averages` divide by the days that HAVE logs, not the range — an
        // unlogged day is unknown intake, not zero. The page says how many.
        days_logged: daily.length,
      };
    },

    fitnessFoodReportTrends: async (_, { start, days = 30 }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const startDate = start ? new Date(start) : subDays(new Date(), days - 1);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + (days - 1));
      endDate.setUTCHours(23, 59, 59, 999);
      const logs = await FoodLog.find({ user_id: user.id, log_date: { $gte: startDate, $lte: endDate } }).populate('food_item_id').lean();
      const daily = buildDaily(logs);
      const rolling = rollingAverage(daily, 7);
      const weightsRaw = await Weight.find({ userId: user.id, log_date: { $gte: startDate, $lte: endDate } }).sort({ log_date: 1 }).lean();
      // One weight per day — a duplicated day would count twice in every mean.
      const weights = onePerDay(weightsRaw).map(w => ({ date: utcDateString(w.log_date), weight: w.weight_value }));
      return {
        range: { start: format(startDate, 'yyyy-MM-dd'), end: format(endDate, 'yyyy-MM-dd'), days },
        daily, rolling, weights, highlights: trendHighlights(daily, weights)
      };
    },

    fitnessInsightsMorningBrief: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const context = await buildUserContext(user.id, { daysBack: 1 });
      const prompt = `You are a friendly health coach. Generate a morning brief based on yesterday's data:\n${ JSON.stringify(context, null, 2) }\nKeep it under 100 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'morning_brief', content: response, generatedAt: new Date(), context: { date: format(new Date(), 'yyyy-MM-dd') } };
    },

    fitnessInsightsDailySummary: async (_, { date }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const targetDate = date || format(new Date(), 'yyyy-MM-dd');
      // `targetDate` used to be interpolated into the prompt but never reach
      // the context builder, so scrolling back to Tuesday returned the last
      // day's food captioned as Tuesday's summary.
      const context = await buildUserContext(user.id, { daysBack: 1, date: targetDate });
      const prompt = `Generate a daily health summary for ${ targetDate }:\n${ JSON.stringify(context, null, 2) }\nFormat with 2-3 key insights, under 150 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'daily_summary', content: response, generatedAt: new Date(), context: { date: targetDate } };
    },

    fitnessInsightsCorrelations: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const context = await buildUserContext(user.id, { daysBack: 30 });
      const prompt = `Analyze this 30-day health data for patterns:\n${ JSON.stringify(context, null, 2) }\nFormat as 3-5 findings, under 250 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'correlations', content: response, generatedAt: new Date(), context: { daysAnalyzed: 30 } };
    },

    fitnessInsightsWeeklyReport: async (parent, { start, days = 7 }, context) => {
      if (!context.user) throw new Error('Unauthorized');
      const report = await resolvers.Query.fitnessFoodReportOverview(parent, { start, days }, context);
      if (!report.daily.length) return { type: 'weekly_report', content: 'No data found.', generatedAt: new Date(), context: report.range };
      const prompt = `Summarize this ${ days }-day food report:\n${ JSON.stringify(report, null, 2) }\nUnder 180 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'weekly_report', content: response, generatedAt: new Date(), context: report.range };
    },

    fitnessInsightsTrendWatch: async (parent, { start, days = 30 }, context) => {
      if (!context.user) throw new Error('Unauthorized');
      const trends = await resolvers.Query.fitnessFoodReportTrends(parent, { start, days }, context);
      if (!trends.daily.length) return { type: 'trend_watch', content: 'No data found.', generatedAt: new Date(), context: trends.range };
      const prompt = `Provide a trend watch summary for this ${ days }-day data:\n${ JSON.stringify(trends, null, 2) }\nUnder 160 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'trend_watch', content: response, generatedAt: new Date(), context: trends.range };
    },

    fitnessInsightsCoaching: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const context = await buildUserContext(user.id, { daysBack: 14 });
      const prompt = `Provide coaching advice based on this 14-day data:\n${ JSON.stringify(context, null, 2) }\n2-3 action items, under 200 words.`;
      const response = await aiService.chat(prompt);
      return { type: 'coaching', content: response, generatedAt: new Date(), context: { daysAnalyzed: 14 } };
    },

    fitnessInsightsContext: async (_, { days = 7 }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return buildUserContext(user.id, { daysBack: days });
    },

    /**
     * Natural-language quick-add (AI_IDEAS.md idea #2, stream R115).
     *
     * Read-only by construction. It answers a *proposal* — one search query
     * per thing the person said they ate — and the frontend runs each query
     * through the existing food search and logs the ticked rows through the
     * ordinary `addFoodLog` mutation. Nothing here writes, and the model never
     * names a food: it returns search terms, so a fragment with no catalog
     * match shows "no match — search?" instead of an invented item.
     *
     * The deterministic split runs first and is also the fallback, so the
     * query answers something useful when the cap is hit, when aiGeek is down
     * or slow, or when the model returns something that will not validate.
     *
     * **The opt-in.** Two switches, and they are not the same switch:
     *
     *   - `ai.enabled` / `ai.features.natural_language_food_logging` on the
     *     user's fitnessgeek settings is the server-side kill switch honoured
     *     here — off means the deterministic split with
     *     `provenance.reason = 'disabled'` and no model call at all.
     *   - The *default-off opt-in* the AI rules ask for is client-side
     *     (`fitnessgeek:quickAddNL` in the browser), because both server-side
     *     flags default to **true** in `@geeksuite/schemas`, which this stream
     *     does not own. Documented in `apps/fitnessgeek/DOCS/CONTEXT.md`;
     *     flipping the schema default is the clean follow-up.
     *
     * Only the sentence and the hour leave the box — no history, no settings,
     * nothing from another app.
     */
    parseFoodEntry: async (_, args, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const { text, date } = validateParseFoodEntryArgs(args || {});

      const hour = hourFromDateHint(date);
      const defaultMealType = mealTypeForHour(hour);
      const fallback = () => deterministicParse(text, { hour });

      const settings = await UserSettings.findOne({ user_id: user.id })
        .select('ai')
        .lean()
        .catch(() => null);
      const modelAllowed =
        settings?.ai?.enabled !== false &&
        // R124: the flag is the opt-in (default false), not a kill switch — only an explicit true opens the model path.
        settings?.ai?.features?.natural_language_food_logging === true;

      let data;
      let provenance;
      if (!modelAllowed) {
        data = fallback();
        provenance = {
          source: 'fallback',
          reason: 'disabled',
          model: null,
          provider: null,
          cached: false,
          callsToday: 0,
          cap: QUICK_ADD_MAX_CALLS_PER_DAY,
        };
      } else {
        ({ data, provenance } = await runAIFeature({
          app: 'fitnessgeek',
          feature: 'quickadd',
          userId: user.id,
          system: QUICK_ADD_SYSTEM_PROMPT,
          user: JSON.stringify({
            sentence: text,
            defaultMealType,
            deterministicFragments: fallback().fragments,
          }),
          schema: QUICK_ADD_SCHEMA,
          validate: isValidProposal,
          fallback,
          maxCallsPerDay: QUICK_ADD_MAX_CALLS_PER_DAY,
        }));
      }

      const { fragments } = normalizeProposal(data, { mealType: defaultMealType });

      // The one number this feature is judged on: proposals produced. The rows
      // actually logged come through `addFoodLog` like any other row and are
      // deliberately NOT tagged — see the CONTEXT note; fitnessgeek has no
      // client telemetry, and the only free-form field on a food log
      // (`notes`) is the user's own text.
      logger.info(
        {
          metric: 'fitnessgeek.quickadd.proposal_logged',
          fragments: fragments.length,
          source: provenance?.source,
          reason: provenance?.reason || null,
        },
        '[fitnessgeek] quick-add proposal'
      );

      return { fragments, provenance };
    },

    garminStatus: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);
      const g = settings.garmin || {};
      return { enabled: !!g.enabled, hasCredentials: !!(g.username && g.password), hasTokens: !!(g.oauth1_token && g.oauth2_token), lastConnectedAt: g.last_connected_at || null };
    },

    garminDaily: async (_, { date }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const { client, settings } = await buildGarminClient(user.id);
      const d = date ? new Date(date) : new Date();
      const [hrRes, weightRes, stepsRes, sleepRes, activitiesRes] = await Promise.allSettled([
        client.getHeartRate(d),
        client.getDailyWeightInPounds(d),
        client.getSteps ? client.getSteps(d) : Promise.reject('N/A'),
        client.getSleepDuration ? client.getSleepDuration(d) : Promise.reject('N/A'),
        client.getActivities ? client.getActivities(0, 50) : Promise.reject('N/A')
      ]);
      const result = { date: d.toISOString().split('T')[0], steps: null, activeCalories: null, restingHR: null, weightLbs: null, sleepMinutes: null, fetchedAt: new Date().toISOString(), lastSyncAt: settings?.garmin?.last_connected_at };
      if (hrRes.status === 'fulfilled' && hrRes.value) result.restingHR = hrRes.value.restingHeartRate || hrRes.value.resting_hr || null;
      if (weightRes.status === 'fulfilled') result.weightLbs = weightRes.value;
      if (stepsRes.status === 'fulfilled') result.steps = typeof stepsRes.value === 'number' ? stepsRes.value : (stepsRes.value?.steps || null);
      if (sleepRes.status === 'fulfilled' && sleepRes.value) result.sleepMinutes = (sleepRes.value.hours || 0) * 60 + (sleepRes.value.minutes || 0);
      if (activitiesRes.status === 'fulfilled' && Array.isArray(activitiesRes.value)) {
        const ymd = d.toISOString().split('T')[0];
        result.activeCalories = Math.round(activitiesRes.value.filter(a => (a.startTimeLocal || '').substring(0, 10) === ymd).reduce((sum, a) => sum + (a.calories || 0), 0));
      }
      await persistGarminTokens(user.id, client);
      return result;
    },

    garminSleep: async (_, { date }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const { client } = await buildGarminClient(user.id);
      const d = date ? new Date(date) : new Date();
      const sleepData = await client.getSleepData(d);
      await persistGarminTokens(user.id, client);
      if (!sleepData) return null;
      const dto = sleepData.dailySleepDTO || sleepData;
      return {
        date: d.toISOString().split('T')[0],
        totalSleepMinutes: dto.sleepTimeSeconds ? Math.round(dto.sleepTimeSeconds / 60) : null,
        deepSleepMinutes: dto.deepSleepSeconds ? Math.round(dto.deepSleepSeconds / 60) : null,
        lightSleepMinutes: dto.lightSleepSeconds ? Math.round(dto.lightSleepSeconds / 60) : null,
        remSleepMinutes: dto.remSleepSeconds ? Math.round(dto.remSleepSeconds / 60) : null,
        awakeSleepMinutes: dto.awakeSleepSeconds ? Math.round(dto.awakeSleepSeconds / 60) : null,
        sleepStartTime: dto.sleepStartTimestampLocal ? new Date(dto.sleepStartTimestampLocal).toISOString() : null,
        sleepEndTime: dto.sleepEndTimestampLocal ? new Date(dto.sleepEndTimestampLocal).toISOString() : null,
        sleepScore: dto.sleepScores?.overall?.value || null,
        sleepQuality: dto.sleepScores?.overall?.qualifierKey || null,
        sleepFeedback: dto.sleepScoreFeedback || null,
        restingHeartRate: sleepData.restingHeartRate || dto.restingHeartRate || null,
        avgOvernightHrv: sleepData.avgOvernightHrv || null,
        hrvStatus: sleepData.hrvStatus || null,
        avgSpO2: dto.averageSpO2Value || null,
        avgRespiration: dto.averageRespirationValue || null,
        avgSleepStress: dto.avgSleepStress || null,
        bodyBatteryChange: sleepData.bodyBatteryChange || null
      };
    },

    garminActivities: async (_, { start = 0, limit = 20 }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const { client } = await buildGarminClient(user.id);
      const activities = await client.getActivities(start, limit);
      await persistGarminTokens(user.id, client);
      return (activities || []).map(a => ({
        activityId: a.activityId,
        activityName: a.activityName,
        activityType: a.activityType?.typeKey || a.activityTypeName || 'unknown',
        startTimeLocal: a.startTimeLocal,
        startTimeGMT: a.startTimeGMT,
        duration: a.duration,
        distance: a.distance,
        calories: a.calories || a.activeKilocalories,
        averageHR: a.averageHR,
        maxHR: a.maxHR,
        averageSpeed: a.averageSpeed,
        elevationGain: a.elevationGain,
        steps: a.steps
      }));
    },
  },

  Mutation: {
    fitnessInsightsChat: async (_, { message, history }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const context = await buildUserContext(user.id, { daysBack: 30 });
      const systemPrompt = `You are a helpful health assistant with access to the user's health data.\n\nUSER HEALTH DATA (LAST 30 DAYS):\n${ JSON.stringify(context, null, 2) }\n\nAnswer based on the actual data provided.`;
      const messages = [
        { role: 'system', content: systemPrompt },
        ...(history || []),
        { role: 'user', content: message }
      ];
      const response = await aiService.chatWithHistory(messages);
      return { type: 'chat', content: response, generatedAt: new Date() };
    },

    updateGarminWeight: async (_, { date, weightLbs, timezone }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const { client } = await buildGarminClient(user.id);
      await client.updateWeight(date ? new Date(date) : new Date(), weightLbs, timezone || 'America/Los_Angeles');
      await persistGarminTokens(user.id, client);
      return { success: true };
    },

    refreshDailySummary: async (_, { date }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      // Same rule as the `dailySummary` query: the caller owns the calendar.
      return DailySummary.updateFromLogs(user.id, requireCalendarDate(date, 'refreshDailySummary'));
    },

    logMeal: async (_, { mealId, date, mealType }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const owned = await Meal.findOwned(mealId, user.id);
      if (!owned) throw new Error('Meal not found');
      const meal = await owned.populate('food_items.food_item_id');

      const logs = [];
      // Calendar date at UTC midnight, matching the read path. REST's
      // add-to-log used parseLocalDate() here and wrote LOCAL midnight, which
      // lands on the previous UTC day west of UTC; this is the fixed version.
      const logDate = toUtcMidnight(date || format(new Date(), 'yyyy-MM-dd'));
      for (const item of meal.food_items) {
        if (!item.food_item_id) continue; // dangling/deleted catalog reference
        const log = new FoodLog({
          user_id: user.id,
          food_item_id: item.food_item_id._id,
          log_date: logDate,
          meal_type: mealType || meal.meal_type || 'snack',
          servings: item.servings,
          // Provenance caption, byte-identical to REST's add-to-log —
          // FoodLogItem.jsx renders `notes` under the food name.
          notes: `Added from meal: ${meal.name}`,
          nutrition: item.food_item_id.nutrition
        });
        await log.save();
        logs.push(log);
      }

      await DailySummary.updateFromLogs(user.id, logDate);
      return FoodLog.find({ _id: { $in: logs.map(l => l._id) }, user_id: user.id }).populate('food_item_id');
    },
    updateFitnessUserSettings: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      
      // `household` is deliberately NOT writable here: membership and the
      // share flags go through create/join/leave/updateFitnessHouseholdSettings,
      // which enforce the "one household at a time" invariant. Accepting it as
      // free-form JSON let a client silently graft itself onto any household id.
      const { theme, household: _ignoredHousehold, ...otherSettings } = input;

      // Dot paths, never whole sub-objects: a partial save must MERGE. See
      // flattenSettingsUpdate() above (BURN_REVIEW #5).
      const promises = [UserSettings.updateSettings(user.id, flattenSettingsUpdate(otherSettings))];
      
      if (theme) {
        const { User } = await import('../../models/user.js');
        promises.push(User.findByIdAndUpdate(user.id, { $set: { 'preferences.theme': theme } }));
      }
      
      const [res] = await Promise.all(promises);
      return res;
    },
    /**
     * One weight per calendar day (plan D8, finding F6).
     *
     * This used to be a bare `new Weight(input).save()`: a second weigh-in on
     * the same day — through the real UI, which only ever calls this — made a
     * second row, and every consumer (chart, AI context, projections) then
     * counted that day twice. REST's POST refuses with a 409 instead; nothing
     * reaches REST, and a 409 is the wrong answer to "I weighed again".
     *
     * So: the day is normalized exactly as REST normalizes it (UTC midnight
     * of the calendar day sent — the frontend sends `localDateString()` —
     * else UTC's today), and if that day already has a row it is UPDATED in
     * place and any surplus same-day rows are removed. A typed value is a
     * manual value, so `source` becomes 'manual' either way. The Arboleaf
     * importer's "import wins" rule still applies the next time an export
     * containing this day is imported.
     */
    addFitnessWeight: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const logDate = toUtcMidnight(input.log_date ?? new Date());
      if (Number.isNaN(logDate.getTime())) throw new Error('addFitnessWeight: `log_date` is not a valid date');
      // Same rounding as REST's POST /api/weight.
      const weightValue = parseFloat(parseFloat(input.weight_value).toFixed(1));
      const { start, end } = utcDayRange(logDate);

      // Oldest first: the surviving row keeps the id a client may already hold.
      const sameDay = await Weight.find({ userId: user.id, log_date: { $gte: start, $lte: end } })
        .sort({ created_at: 1, _id: 1 });
      if (!sameDay.length) {
        return new Weight({
          userId: user.id,
          weight_value: weightValue,
          log_date: logDate,
          notes: input.notes ?? '',
          source: 'manual',
        }).save();
      }

      const [row, ...surplus] = sameDay;
      row.weight_value = weightValue;
      row.log_date = logDate;
      if (input.notes != null) row.notes = input.notes;
      row.source = 'manual';
      row.updated_at = new Date();
      await row.save();
      if (surplus.length) {
        await Weight.deleteMany({ _id: { $in: surplus.map((w) => w._id) }, userId: user.id });
      }
      return row;
    },
    updateFitnessWeight: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const update = { ...input, updated_at: new Date() };
      // A typed correction is a manual value, whatever wrote the row first.
      if (input?.weight_value !== undefined) update.source = 'manual';
      // Calendar day at UTC midnight, as REST's PUT normalizes it.
      if (input?.log_date != null) update.log_date = toUtcMidnight(input.log_date);
      const w = await Weight.findOneAndUpdate({ _id: id, userId: user.id }, update, { new: true });
      if (!w) throw new Error('Weight record not found');
      return w;
    },
    deleteFitnessWeight: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const result = await Weight.deleteOne({ _id: id, userId: user.id });
      return result.deletedCount === 1;
    },
    setNutritionGoals: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return NutritionGoals.createGoals(user.id, input);
    },
    addFitnessFood: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      // GraphQL FitnessFoodInput uses flat serving_size/serving_unit and has no
      // `source` field. The Mongoose FoodItem model uses nested serving.{size,unit}
      // and requires `source`. Translate here so the GraphQL schema stays clean.
      // `id`/`source`/`source_id` exist on FitnessFoodInput only for
      // FoodLogInput.food_item's findOrCreate path — dropped here so this
      // mutation keeps minting a PRIVATE custom food and nothing else.
      const { serving_size, serving_unit, id: _id, source: _source, source_id: _sourceId, ...rest } = input;
      const doc = {
        ...rest,
        serving: { size: serving_size, unit: serving_unit || 'g' },
        source: 'custom',
        user_id: user.id,
      };
      return new FoodItem(doc).save();
    },
    updateFitnessFood: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      // A partial edit must MERGE. `{nutrition: {...}}` / `{serving: {...}}`
      // as nested literals make MongoDB replace the whole sub-document: a
      // calories-only edit would reset the other six macros to the schema's
      // `0`, and a unit-only edit would delete `serving.size` — a
      // `required, min: 0.1` path, with update validators off, so the row
      // only fails the NEXT time something touches it. Dot paths, and only
      // for the keys the client actually sent. (BURN_REVIEW #19.)
      const {
        serving_size, serving_unit, nutrition,
        id: _id, source: _source, source_id: _sourceId,
        ...rest
      } = input;
      const update = { ...rest, updated_at: new Date() };
      if (nutrition && typeof nutrition === 'object') {
        for (const [key, value] of Object.entries(nutrition)) {
          if (value !== undefined) update[`nutrition.${ key }`] = value;
        }
      }
      if (serving_size != null) update['serving.size'] = serving_size;
      if (serving_unit != null) update['serving.unit'] = serving_unit;
      const food = await FoodItem.findOneAndUpdate(
        { _id: id, user_id: user.id },
        update,
        { new: true }
      );
      if (!food) throw new Error('Food item not found or unauthorized');
      return food;
    },
    deleteFitnessFood: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const result = await FoodItem.findOneAndUpdate({ _id: id, user_id: user.id }, { is_deleted: true, updated_at: new Date() });
      return !!result;
    },
    addFoodLog: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      // eslint-disable-next-line no-unused-vars
      const { food_item, food_item_id, log_date, ...rest } = input;
      const food = await resolveLogFoodItem(input, user.id);
      const logDate = toUtcMidnight(log_date);
      const log = new FoodLog({
        ...rest,
        user_id: user.id,
        food_item_id: food._id,
        log_date: logDate,
        nutrition: input.nutrition || food.nutrition,
      });
      await log.save();
      await DailySummary.updateFromLogs(user.id, logDate);
      return log.populate('food_item_id');
    },
    updateFoodLog: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      if (!isValidObjectId(id)) throw new Error('Food log not found');
      // Partial patch (FoodLogUpdateInput): only the fields actually supplied
      // are written, so a servings-only edit no longer has to resend
      // food_item_id — and therefore no longer re-runs the accessibility
      // check against a food that may since have been soft-deleted.
      if (input?.food_item_id) await assertAccessibleFoodItems([input], user.id);
      const patch = { updated_at: new Date() };
      for (const key of ['meal_type', 'servings', 'notes', 'nutrition', 'food_item_id']) {
        if (input?.[key] != null) patch[key] = input[key];
      }
      if (input?.log_date != null) patch.log_date = toUtcMidnight(input.log_date);
      const log = await FoodLog.findOneAndUpdate({ _id: id, user_id: user.id }, patch, { new: true }).populate('food_item_id');
      if (!log) throw new Error('Food log not found');
      await DailySummary.updateFromLogs(user.id, log.log_date);
      return log;
    },
    deleteFoodLog: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      if (!isValidObjectId(id)) return false;
      // Read the date before the row goes away — the summary for that day has
      // to be recomputed without it, exactly as REST DELETE /api/logs/:id does.
      const log = await FoodLog.findOne({ _id: id, user_id: user.id });
      if (!log) return false;
      const logDate = log.log_date;
      const result = await FoodLog.deleteOne({ _id: id, user_id: user.id });
      if (result.deletedCount !== 1) return false;
      await DailySummary.updateFromLogs(user.id, logDate);
      return true;
    },
    addFitnessMeal: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      await assertAccessibleFoodItems(input?.food_items, user.id);
      const meal = new Meal({ ...input, user_id: user.id });
      await meal.save();
      return meal.populate('food_items.food_item_id');
    },
    updateFitnessMeal: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      if (!isValidObjectId(id)) throw new Error('Meal not found or unauthorized');
      await assertAccessibleFoodItems(input?.food_items, user.id);
      // Owner-scoped only: the previous `$or: [{ user_id: null }]` branch let
      // any authenticated user rewrite ownerless (shared) meal rows.
      const meal = await Meal.findOneAndUpdate({ _id: id, user_id: user.id }, { ...input, updated_at: new Date() }, { new: true }).populate('food_items.food_item_id');
      if (!meal) throw new Error('Meal not found or unauthorized');
      return meal;
    },
    deleteFitnessMeal: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      if (!isValidObjectId(id)) return false;
      const result = await Meal.findOneAndUpdate({ _id: id, user_id: user.id }, { is_deleted: true, updated_at: new Date() });
      return !!result;
    },
    addFitnessMedication: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return new Medication({ ...input, user_id: user.id }).save();
    },
    updateFitnessMedication: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const med = await Medication.findOneAndUpdate({ _id: id, user_id: user.id }, { ...input, updated_at: new Date() }, { new: true });
      if (!med) throw new Error('Medication not found');
      return med;
    },
    deleteFitnessMedication: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const result = await Medication.deleteOne({ _id: id, user_id: user.id });
      return result.deletedCount === 1;
    },
    addBloodPressure: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      return new BloodPressure({ ...input, userId: user.id }).save();
    },
    updateBloodPressure: async (_, { id, input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const bp = await BloodPressure.findOneAndUpdate({ _id: id, userId: user.id }, { ...input, updated_at: new Date() }, { new: true });
      if (!bp) throw new Error('Blood pressure record not found');
      return bp;
    },
    deleteBloodPressure: async (_, { id }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const result = await BloodPressure.deleteOne({ _id: id, userId: user.id });
      return result.deletedCount === 1;
    },

    recordLoginStreak: async (_, { date } = {}, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const streak = await LoginStreak.getOrCreateStreak(user.id);
      // The caller's own calendar day — see the shared module's header for
      // what deciding it here instead used to cost.
      await streak.recordLogin(date || null);
      return {
        currentStreak: streak.current_streak,
        longestStreak: streak.longest_streak,
        lastLoginDate: streak.last_login_date ? streak.last_login_date.toISOString().split('T')[0] : null,
        streakStartDate: streak.streak_start_date ? streak.streak_start_date.toISOString().split('T')[0] : null,
      };
    },

    createFitnessHousehold: async (_, { display_name }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);

      if (settings.household?.household_id) throw new Error('You are already part of a household');

      const householdId = crypto.randomBytes(6).toString('hex').toUpperCase();
      settings.household = {
        household_id: householdId,
        display_name: display_name || 'Me',
        share_food_logs: true,
        share_weight: false,
        share_meals: true
      };

      await settings.save();
      return { ...settings.household, members: [] };
    },

    joinFitnessHousehold: async (_, { household_id, display_name }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      if (!household_id) throw new Error('Household ID is required');

      const settings = await UserSettings.getOrCreate(user.id);
      if (settings.household?.household_id) throw new Error('You are already part of a household');

      const existingMember = await UserSettings.findOne({ 'household.household_id': household_id.toUpperCase() });
      if (!existingMember) throw new Error('Household not found');

      settings.household = {
        household_id: household_id.toUpperCase(),
        display_name: display_name || 'Family Member',
        share_food_logs: true,
        share_weight: false,
        share_meals: true
      };

      await settings.save();
      return { ...settings.household, members: [] }; // Members will be fetched by Query.fitnessHousehold next time
    },

    updateFitnessHouseholdSettings: async (_, { input }, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);
      if (!settings.household?.household_id) throw new Error('You are not part of a household');

      if (input.display_name !== undefined) settings.household.display_name = input.display_name;
      if (input.share_food_logs !== undefined) settings.household.share_food_logs = input.share_food_logs;
      if (input.share_weight !== undefined) settings.household.share_weight = input.share_weight;
      if (input.share_meals !== undefined) settings.household.share_meals = input.share_meals;

      await settings.save();
      return { ...settings.household, members: [] };
    },

    leaveFitnessHousehold: async (_, __, { user }) => {
      if (!user) throw new Error('Unauthorized');
      const settings = await UserSettings.getOrCreate(user.id);
      if (!settings.household?.household_id) throw new Error('You are not part of a household');

      settings.household = {
        household_id: undefined,
        display_name: undefined,
        share_food_logs: true,
        share_weight: false,
        share_meals: true
      };

      await settings.save();
      return true;
    },

    copyFitnessMeal: async (_, { from_date, to_date, from_meal_type, to_meal_type, from_user_id }, { user }) => {
      if (!user) throw new Error('Unauthorized');

      let sourceUserId = user.id;
      if (from_user_id && from_user_id !== user.id) {
        const [userSettings, memberSettings] = await Promise.all([
          UserSettings.getOrCreate(user.id),
          UserSettings.findOne({ user_id: from_user_id })
        ]);

        if (!userSettings.household?.household_id || !memberSettings?.household?.household_id || memberSettings.household.household_id !== userSettings.household.household_id) {
          throw new Error('Cannot copy from user outside your household');
        }
        if (!memberSettings.household.share_food_logs) throw new Error('This household member has not enabled food log sharing');
        sourceUserId = from_user_id;
      }

      const query = { user_id: sourceUserId, log_date: new Date(from_date) };
      if (from_meal_type) query.meal_type = from_meal_type;

      const sourceLogs = await FoodLog.find(query);
      if (!sourceLogs.length) throw new Error('No food logs found for the source date/meal');

      const newLogs = [];
      const targetDate = new Date(to_date);

      for (const sourceLog of sourceLogs) {
        const targetMealType = to_meal_type || sourceLog.meal_type;
        const newLog = new FoodLog({
          user_id: user.id,
          food_item_id: sourceLog.food_item_id,
          log_date: targetDate,
          meal_type: targetMealType,
          servings: sourceLog.servings,
          notes: sourceLog.notes ? `(Copied) ${ sourceLog.notes }` : '',
          nutrition: sourceLog.nutrition
        });
        await newLog.save();
        newLogs.push(newLog);
      }

      await DailySummary.updateFromLogs(user.id, to_date);
      return newLogs.map(l => l.populate('food_item_id'));
    },
  },

  FitnessUserSettings: { id: (s) => s._id.toString() },
  FitnessWeight: { id: (w) => w._id.toString() },
  NutritionGoals: { id: (g) => g._id.toString() },
  // `FitnessFood` is declared FLAT (serving_size / serving_unit) while the
  // shared FoodItem schema stores `serving: {size, unit}`. Without these two
  // resolvers mongoose hands back a document with no such properties and
  // GraphQL answers null for both — which is how MyFoods' edit dialog, which
  // pre-fills from the row it just read, rewrote every custom food's serving
  // to the 100 g fallback. (BURN_REVIEW #15.)
  FitnessFood: {
    id: (f) => f._id.toString(),
    serving_size: (f) => f.serving?.size ?? f.serving_size ?? null,
    serving_unit: (f) => f.serving?.unit ?? f.serving_unit ?? null,
  },
  FoodLog: { id: (l) => l._id.toString() },
  FitnessMeal: { id: (m) => m._id.toString() },
  FitnessMedication: { id: (m) => m._id.toString() },
  BloodPressure: { id: (b) => b._id.toString() },
};
