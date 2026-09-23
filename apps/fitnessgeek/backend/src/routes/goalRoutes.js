import express from 'express';
const router = express.Router();
import { authenticateToken } from '../middleware/auth.js';
import UserSettings from '../models/UserSettings.js';
import BodyComposition from '../models/BodyComposition.js';
import * as garmin from '../services/garminConnectService.js';
import {
  utcDateString,
  leanMassLb,
  leanMassForTargets,
  deriveMacroTargets,
  macrosForCalories,
} from '@geeksuite/utils';
import { reqLogger } from '../utils/reqLogger.js';

// Get user goals
router.get('/', authenticateToken, async (req, res) => {
    try {
    const userId = req.user?.id;
    // Use user ID as-is (baseGeek might not use MongoDB ObjectIds)
    const userIdObjectId = userId;
    const settings = await UserSettings.getOrCreate(userIdObjectId);

    const ng = settings.nutrition_goal || {};
    const wg = settings.weight_goal || null;

    const goals = {
      nutrition: {
        trackMacros: !!ng.enabled || !!ng.daily_calorie_target || !!(ng.weekly_schedule && ng.weekly_schedule.length),
        goals: {
          calories: ng.daily_calorie_target || 0,
          protein: ng.protein_grams || 0,
          carbs: ng.carbs_grams || 0,
          fat: ng.fat_grams || 0
        }
      },
      // `UserSettings.weight_goal` declares startWeight / targetWeight /
      // startDate / goalDate — camelCase, and the two dates are plain
      // `YYYY-MM-DD` STRINGS. This route read (and POST / wrote) the snake_case
      // spellings, which are not schema paths at all: mongoose strict mode
      // dropped every write, and every read came back undefined. See
      // packages/schemas/fitnessgeek/userSettings.js.
      weight: wg ? {
        startWeight: wg.startWeight ?? null,
        targetWeight: wg.targetWeight ?? null,
        startDate: utcDateString(wg.startDate) || null,
        goalDate: utcDateString(wg.goalDate) || null,
        is_active: wg.is_active
      } : null
    };

    res.json({
      success: true,
      data: goals
    });
  } catch (error) {
    reqLogger(req).error({ err: error }, 'Error fetching goals');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch goals',
        code: 'GOALS_FETCH_ERROR'
      }
    });
  }
});

// Save user goals
router.post('/', authenticateToken, async (req, res) => {
    try {
    const userId = req.user?.id;
    const { nutrition, weight } = req.body;

    // Use user ID as-is (baseGeek might not use MongoDB ObjectIds)
    const userIdObjectId = userId;

    // Validate the request structure
    if (!nutrition && !weight) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'At least nutrition or weight goals must be provided',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    const settings = await UserSettings.getOrCreate(userIdObjectId);

    // Save nutrition goals if provided.
    //
    // `updateSettings` writes dot paths now, so this only has to name the keys
    // it actually means to change — spreading the existing sub-document is both
    // unnecessary and wrong (`{...mongooseSubdoc}` copies `$__`/`_doc`, not the
    // fields). Only keys the caller supplied are sent; the rest of
    // `nutrition_goal` is left alone.
    //
    // NOTE: `protein_grams` / `carbs_grams` / `fat_grams` are deliberately NOT
    // written. `UserSettings.nutrition_goal` declares no such paths — it carries
    // `daily_calorie_target` plus the `*_g_per_lb_goal` ratios — so mongoose
    // strict mode dropped them silently, and `goals_met.{protein,carbs,fat}` has
    // been permanently false as a result. Deciding what a macro goal on this
    // document IS (gram target, ratio, or a read of the `nutritiongoals`
    // collection) is follow-up #8 in DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md §12.
    if (nutrition && nutrition.goals) {
      const ng = {
        enabled: nutrition.trackMacros ?? settings.nutrition_goal?.enabled ?? true,
        ...(nutrition.goals.calories !== undefined ? { daily_calorie_target: nutrition.goals.calories } : {}),
        ...(nutrition.mode !== undefined && { mode: nutrition.mode }),
        ...(nutrition.keto !== undefined && { keto: nutrition.keto })
      };
      await UserSettings.updateSettings(userIdObjectId, { nutrition_goal: ng });
    }

    // Save weight goals if provided. Schema spelling: camelCase keys, and the
    // two dates are `YYYY-MM-DD` strings, not Dates.
    if (weight) {
      const wg = {
        enabled: !!weight.startWeight && !!weight.targetWeight,
        ...(weight.startWeight !== undefined ? { startWeight: weight.startWeight } : {}),
        ...(weight.targetWeight !== undefined ? { targetWeight: weight.targetWeight } : {}),
        startDate: weight.startDate
          ? utcDateString(weight.startDate)
          // Fallback only: the caller sent no start date and none is stored.
          // This is the SERVER's UTC day (see BURN_REVIEW #13 — no container
          // installs tzdata), which is why the client normally sends one.
          : (settings.weight_goal?.startDate || utcDateString(new Date())),
        ...(weight.goalDate !== undefined ? { goalDate: utcDateString(weight.goalDate) } : {}),
        is_active: !!(weight.startWeight && weight.targetWeight)
      };
      await UserSettings.updateSettings(userIdObjectId, { weight_goal: wg });
    }

    res.json({ success: true, message: 'Goals saved successfully' });
  } catch (error) {
    reqLogger(req).error({ err: error }, 'Error saving goals');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to save goals',
        code: 'GOALS_SAVE_ERROR'
      }
    });
  }
});

/**
 * The lean mass a macro target may use (plan D1/D3): the 14-day mean ending at
 * the latest scan, while that scan is ≤ 30 days old. Same rule, same shared
 * function, as the gateway's bodyCompPoints.js — only the model differs.
 */
async function leanMassForUser(userId, today) {
  const scans = await BodyComposition.find({ userId }).sort({ measured_at: 1 }).lean();
  if (!scans.length) return null;
  const points = scans.map((s) => ({ date: s.log_date, lean_mass_lb: leanMassLb(s) }));
  return leanMassForTargets(points, { today });
}

// GET /api/goals/nutrition/macros - derive daily/weekly macro targets from rules
//
// Not called by the live frontend (which uses the gateway's `derivedMacros`),
// but it must not drift: the arithmetic is `deriveMacroTargets` /
// `macrosForCalories` from @geeksuite/utils — the one implementation (plan D5)
// — rather than the third hand-copied version this used to carry.
router.get('/nutrition/macros', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const settings = await UserSettings.getOrCreate(userId);
    const ng = settings?.nutrition_goal || {};

    const goalWeightLbs = ng.goal_weight_lbs ?? ng.target_weight ?? ng.targetWeight;
    if (!goalWeightLbs) {
      return res.status(400).json({ success: false, error: { message: 'Missing target_weight in nutrition_goal' } });
    }

    // The server's local calendar day. This route has always used it (no
    // caller sends one); kept rather than silently changed.
    const d = new Date();
    const localYMD = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];

    const lean = await leanMassForUser(userId, localYMD);
    const derived = deriveMacroTargets(ng, { leanMassLb: lean?.lean_mass_lb ?? null });
    const { fixed, calories, weekly } = derived;
    const rules = {
      ...derived.rules,
      carb_strategy: 'fill',
      // This route's own mode inference, older than the shared module's.
      calorie_target_mode: ng.calorie_target_mode || (ng.plan_type === 'auto' ? 'auto' : (Array.isArray(ng.weekly_schedule) ? 'weekly' : 'fixed')),
    };
    const weeklyBase = calories.weekly_schedule;
    const dailyCal = calories.daily;

    // Determine today index (0 = Monday)
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const dow = local.getDay(); // 0=Sun..6=Sat
    const todayIndex = (dow + 6) % 7;

    // Compute today with live Garmin activity
    let today = weekly[todayIndex] || null;
    try {
      const hrProfile = await garmin.getDaily(req.user.id, localYMD);
      const active = Math.max(0, Number(hrProfile?.activeCalories) || 0);
      const add = Math.min(rules.activity_eatback_cap_kcal, Math.round(rules.activity_eatback_fraction * active));
      const baseCal = weeklyBase[todayIndex] || dailyCal || 0;
      const target = baseCal + add;
      // That day's grams at its eaten-back calories — in keto the split is a
      // share of calories, so protein and fat can move too, not just carbs.
      today = {
        dayIndex: todayIndex,
        base_calories: baseCal,
        activity_add_kcal: add,
        target_calories: target,
        ...macrosForCalories(target, rules),
      };
    } catch (e) {
      // keep preview-based today when Garmin unavailable
    }

    res.json({
      success: true,
      data: { rules, fixed, calories, weekly, today, todayIndex }
    });
  } catch (error) {
    reqLogger(req).error({ err: error }, 'Error deriving nutrition macros');
    res.status(500).json({ success: false, error: { message: 'Failed to derive macros' } });
  }
});

export default router;