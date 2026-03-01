const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const aiCoachService = require('../services/aiCoachService');
const FoodLog = require('../models/FoodLog');
const NutritionGoals = require('../models/NutritionGoals');
const logger = require('../config/logger');

/**
 * GET /api/ai-coach/meal-suggestions
 * Get AI-powered meal suggestions based on remaining calories/macros
 */
router.get('/meal-suggestions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Get today's logs
    const logs = await FoodLog.find({
      user_id: userId,
      log_date: { $gte: today }
    }).populate('food_item_id');

    // Get nutrition goals
    const goals = await NutritionGoals.findOne({
      user_id: userId,
      is_active: true
    });

    if (!goals) {
      return res.status(404).json({ error: 'No active nutrition goals found' });
    }

    // Calculate current totals
    const currentTotals = logs.reduce((acc, log) => {
      const food = log.food_item_id;
      const multiplier = log.servings || 1;
      return {
        calories: acc.calories + (food.nutrition.calories_per_serving * multiplier),
        protein: acc.protein + (food.nutrition.protein_grams * multiplier),
        carbs: acc.carbs + (food.nutrition.carbs_grams * multiplier),
        fat: acc.fat + (food.nutrition.fat_grams * multiplier)
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const dailyData = {
      calorieGoal: goals.calories,
      proteinGoal: goals.protein_grams,
      carbsGoal: goals.carbs_grams,
      fatGoal: goals.fat_grams,
      currentCalories: Math.round(currentTotals.calories),
      currentProtein: Math.round(currentTotals.protein),
      currentCarbs: Math.round(currentTotals.carbs),
      currentFat: Math.round(currentTotals.fat),
      remainingCalories: Math.round(goals.calories - currentTotals.calories),
      remainingProtein: Math.round(goals.protein_grams - currentTotals.protein),
      remainingCarbs: Math.round(goals.carbs_grams - currentTotals.carbs),
      remainingFat: Math.round(goals.fat_grams - currentTotals.fat)
    };

    const suggestions = await aiCoachService.generateMealSuggestions(
      userId,
      dailyData,
      req.token
    );

    res.json({ suggestions, dailyData });
  } catch (error) {
    logger.error('Error generating meal suggestions:', error);
    res.status(500).json({ error: 'Failed to generate meal suggestions' });
  }
});

/**
 * GET /api/ai-coach/eating-patterns
 * Analyze weekly eating patterns and provide coaching
 */
router.get('/eating-patterns', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const logs = await FoodLog.find({
      user_id: userId,
      log_date: { $gte: weekAgo }
    }).populate('food_item_id').sort({ log_date: 1 });

    // Group by day
    const dailyData = {};
    logs.forEach(log => {
      const dateStr = log.log_date.toISOString().split('T')[0];
      if (!dailyData[dateStr]) {
        dailyData[dateStr] = { calories: 0, protein: 0, meals: 0 };
      }
      const food = log.food_item_id;
      const multiplier = log.servings || 1;
      dailyData[dateStr].calories += food.nutrition.calories_per_serving * multiplier;
      dailyData[dateStr].protein += food.nutrition.protein_grams * multiplier;
      dailyData[dateStr].meals += 1;
    });

    const weeklyData = Object.keys(dailyData).map(date => ({
      date,
      ...dailyData[date]
    }));

    const analysis = await aiCoachService.analyzeEatingPatterns(
      userId,
      weeklyData,
      req.token
    );

    res.json({ analysis, weeklyData });
  } catch (error) {
    logger.error('Error analyzing eating patterns:', error);
    res.status(500).json({ error: 'Failed to analyze eating patterns' });
  }
});

/**
 * GET /api/ai-coach/micro-adjustments
 * Get small, actionable nutrition tweaks
 */
router.get('/micro-adjustments', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const recentLogs = await FoodLog.find({
      user_id: userId
    })
    .populate('food_item_id')
    .sort({ log_date: -1 })
    .limit(10);

    const formattedLogs = recentLogs.map(log => {
      const food = log.food_item_id;
      const multiplier = log.servings || 1;
      return {
        food_name: food.name,
        calories: Math.round(food.nutrition.calories_per_serving * multiplier),
        protein: Math.round(food.nutrition.protein_grams * multiplier),
        carbs: Math.round(food.nutrition.carbs_grams * multiplier),
        fat: Math.round(food.nutrition.fat_grams * multiplier)
      };
    });

    const adjustments = await aiCoachService.suggestMicroAdjustments(
      userId,
      formattedLogs,
      req.token
    );

    res.json({ adjustments });
  } catch (error) {
    logger.error('Error generating micro-adjustments:', error);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

/**
 * POST /api/ai-coach/ask
 * Ask the AI coach a nutrition question
 */
router.post('/ask', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Get user context
    const goals = await NutritionGoals.findOne({
      user_id: userId,
      is_active: true
    });

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const logs = await FoodLog.find({
      user_id: userId,
      log_date: { $gte: weekAgo }
    }).populate('food_item_id');

    const avgCalories = logs.length > 0
      ? logs.reduce((sum, log) => {
          const multiplier = log.servings || 1;
          return sum + (log.food_item_id.nutrition.calories_per_serving * multiplier);
        }, 0) / logs.length
      : 0;

    const userContext = {
      goal: goals?.goal || 'maintain',
      calorieTarget: goals?.calories || 2000,
      avgCalories: Math.round(avgCalories),
      proteinTarget: goals?.protein_grams || 150,
      activityLevel: 'moderate'
    };

    const answer = await aiCoachService.answerNutritionQuestion(
      userId,
      question,
      userContext,
      req.token
    );

    res.json({ answer, question });
  } catch (error) {
    logger.error('Error answering nutrition question:', error);
    res.status(500).json({ error: 'Failed to get answer' });
  }
});

module.exports = router;
