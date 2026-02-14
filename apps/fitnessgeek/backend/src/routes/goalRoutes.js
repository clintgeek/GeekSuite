const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const UserSettings = require('../models/UserSettings');

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
      weight: wg ? {
        startWeight: wg.start_weight,
        targetWeight: wg.target_weight,
        startDate: wg.start_date ? wg.start_date.toISOString().split('T')[0] : null,
        goalDate: wg.goal_date ? wg.goal_date.toISOString().split('T')[0] : null,
        is_active: wg.is_active
      } : null
    };

    res.json({
      success: true,
      data: goals
    });
  } catch (error) {
    console.error('Error fetching goals:', error);
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

    // Save nutrition goals if provided
    if (nutrition && nutrition.goals) {
      const ng = {
        ...settings.nutrition_goal,
        enabled: nutrition.trackMacros ?? settings.nutrition_goal?.enabled ?? true,
        daily_calorie_target: nutrition.goals.calories ?? settings.nutrition_goal?.daily_calorie_target,
        protein_grams: nutrition.goals.protein ?? settings.nutrition_goal?.protein_grams,
        carbs_grams: nutrition.goals.carbs ?? settings.nutrition_goal?.carbs_grams,
        fat_grams: nutrition.goals.fat ?? settings.nutrition_goal?.fat_grams
      };
      await UserSettings.updateSettings(userIdObjectId, { nutrition_goal: ng });
    }

    // Save weight goals if provided
    if (weight) {
      const wg = {
        enabled: !!weight.startWeight && !!weight.targetWeight,
        start_weight: weight.startWeight ?? settings.weight_goal?.start_weight,
        target_weight: weight.targetWeight ?? settings.weight_goal?.target_weight,
        start_date: weight.startDate ? new Date(weight.startDate) : (settings.weight_goal?.start_date || new Date()),
        goal_date: weight.goalDate ? new Date(weight.goalDate) : (settings.weight_goal?.goal_date || null),
        is_active: !!(weight.startWeight && weight.targetWeight)
      };
      await UserSettings.updateSettings(userIdObjectId, { weight_goal: wg });
    }

    res.json({ success: true, message: 'Goals saved successfully' });
  } catch (error) {
    console.error('Error saving goals:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to save goals',
        code: 'GOALS_SAVE_ERROR'
      }
    });
  }
});

// GET /api/goals/nutrition/macros - derive daily/weekly macro targets from rules
router.get('/nutrition/macros', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const settings = await UserSettings.getOrCreate(userId);
    const ng = settings?.nutrition_goal || {};

    const goalWeightLbs = ng.goal_weight_lbs ?? ng.target_weight ?? ng.targetWeight;
    if (!goalWeightLbs) {
      return res.status(400).json({ success: false, error: { message: 'Missing target_weight in nutrition_goal' } });
    }

    const proteinPerLb = ng.protein_g_per_lb_goal ?? ng.protein_g_per_lb ?? 0.8;
    const fatPerLb = ng.fat_g_per_lb_goal ?? ng.fat_g_per_lb ?? 0.35;
    const carbStrategy = 'fill';

    const proteinG = Math.round(proteinPerLb * goalWeightLbs);
    const fatG = Math.round(fatPerLb * goalWeightLbs);
    const proteinKcal = proteinG * 4;
    const fatKcal = fatG * 9;

    const mode = ng.calorie_target_mode || (ng.plan_type === 'auto' ? 'auto' : (Array.isArray(ng.weekly_schedule) ? 'weekly' : 'fixed'));
    const dailyCal = ng.daily_calorie_target || ng.auto_base_calories || ng.fixed_calories || null;
    const weeklyBase = Array.isArray(ng.weekly_schedule) && ng.weekly_schedule.length === 7
      ? ng.weekly_schedule
      : (dailyCal ? new Array(7).fill(dailyCal) : [0,0,0,0,0,0,0]);

    // Activity add rules
    const eatFrac = typeof ng.activity_eatback_fraction === 'number' ? ng.activity_eatback_fraction : 0.6;
    const eatCap = typeof ng.activity_eatback_cap_kcal === 'number' ? ng.activity_eatback_cap_kcal : 500;

    const weekly = weeklyBase.map((baseCal, idx) => {
      // Compute activity add for each preview day as 0 (only today uses live value); caller can enhance later
      const activityAdd = 0;
      const target = baseCal + activityAdd;
      const carbsG = Math.max(0, Math.round((target - (proteinKcal + fatKcal)) / 4));
      return {
        dayIndex: idx, // 0 = Monday convention used elsewhere
        base_calories: baseCal,
        activity_add_kcal: activityAdd,
        target_calories: target,
        protein_g: proteinG,
        fat_g: fatG,
        carbs_g: carbsG
      };
    });

    // Determine today index (0 = Monday)
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const dow = local.getDay(); // 0=Sun..6=Sat
    const todayIndex = (dow + 6) % 7;

    // Compute today with live Garmin activity
    let today = weekly[todayIndex] || null;
    try {
      // Reuse Garmin wrapper
      const garmin = require('../services/garminConnectService');
      const d = new Date();
      const localYMD = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
      const hrProfile = await garmin.getDaily(req.user.id, localYMD);
      const active = Math.max(0, Number(hrProfile?.activeCalories) || 0);
      const add = Math.min(eatCap, Math.round(eatFrac * active));
      const baseCal = weeklyBase[todayIndex] || dailyCal || 0;
      const target = baseCal + add;
      const carbsG = Math.max(0, Math.round((target - (proteinKcal + fatKcal)) / 4));
      today = {
        dayIndex: todayIndex,
        base_calories: baseCal,
        activity_add_kcal: add,
        target_calories: target,
        protein_g: proteinG,
        fat_g: fatG,
        carbs_g: carbsG
      };
    } catch (e) {
      // keep preview-based today when Garmin unavailable
    }

    res.json({
      success: true,
      data: {
        rules: {
          goal_weight_lbs: goalWeightLbs,
          protein_g_per_lb: proteinPerLb,
          fat_g_per_lb: fatPerLb,
          carb_strategy: carbStrategy,
          calorie_target_mode: mode,
          activity_eatback_fraction: eatFrac,
          activity_eatback_cap_kcal: eatCap
        },
        fixed: {
          protein_g: proteinG,
          fat_g: fatG,
          protein_kcal: proteinKcal,
          fat_kcal: fatKcal
        },
        calories: {
          daily: dailyCal,
          weekly_schedule: weeklyBase
        },
        weekly,
        today,
        todayIndex
      }
    });
  } catch (error) {
    console.error('Error deriving nutrition macros:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to derive macros' } });
  }
});

module.exports = router;