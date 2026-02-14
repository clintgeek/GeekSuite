const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const DailySummary = require('../models/DailySummary');
const logger = require('../config/logger');

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/summary/today - Get today's summary
router.get('/today', async (req, res) => {
  try {
    const userId = req.user.id;
    // Local today in YYYY-MM-DD
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const today = local.toISOString().split('T')[0];

    const summary = await DailySummary.updateFromLogs(userId, today);

    logger.info('Today\'s summary retrieved', {
      userId,
      hasData: summary.totals.calories > 0
    });

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    logger.error('Error getting today\'s summary:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve today\'s summary',
        code: 'SUMMARY_RETRIEVAL_ERROR'
      }
    });
  }
});

// GET /api/summary/:date - Get daily summary for specific date
router.get('/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const userId = req.user.id;

    const summary = await DailySummary.updateFromLogs(userId, date);

    logger.info('Daily summary retrieved', {
      userId,
      date,
      hasData: summary.totals.calories > 0
    });

    res.json({
      success: true,
      data: summary
    });

  } catch (error) {
    logger.error('Error getting daily summary:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve daily summary',
        code: 'SUMMARY_RETRIEVAL_ERROR'
      }
    });
  }
});

// GET /api/summary/range/:startDate/:endDate - Get summaries for date range
router.get('/range/:startDate/:endDate', async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    const userId = req.user.id;

    const summaries = await DailySummary.getSummaryRange(userId, startDate, endDate);

    logger.info('Daily summaries retrieved for range', {
      userId,
      startDate,
      endDate,
      count: summaries.length
    });

    res.json({
      success: true,
      data: summaries
    });

  } catch (error) {
    logger.error('Error getting daily summaries for range:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve daily summaries',
        code: 'SUMMARY_RETRIEVAL_ERROR'
      }
    });
  }
});

// POST /api/summary/:date/refresh - Force refresh daily summary
router.post('/:date/refresh', async (req, res) => {
  try {
    const { date } = req.params;
    const userId = req.user.id;

    const summary = await DailySummary.updateFromLogs(userId, date);

    logger.info('Daily summary refreshed', {
      userId,
      date,
      hasData: summary.totals.calories > 0
    });

    res.json({
      success: true,
      data: summary,
      message: 'Daily summary refreshed successfully'
    });

  } catch (error) {
    logger.error('Error refreshing daily summary:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to refresh daily summary',
        code: 'SUMMARY_REFRESH_ERROR'
      }
    });
  }
});

// GET /api/summary/week/:startDate - Get weekly summary
router.get('/week/:startDate', async (req, res) => {
  try {
    const { startDate } = req.params;
    const userId = req.user.id;

    // Calculate end date (7 days from start)
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const summaries = await DailySummary.getSummaryRange(userId, start, end);

    // Calculate weekly totals
    const weeklyTotals = {
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0,
      fiber_grams: 0,
      sugar_grams: 0,
      sodium_mg: 0
    };

    const weeklyMeals = {
      breakfast: { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 },
      lunch: { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 },
      dinner: { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 },
      snack: { calories: 0, protein_grams: 0, carbs_grams: 0, fat_grams: 0 }
    };

    summaries.forEach(summary => {
      // Add to weekly totals
      weeklyTotals.calories += summary.totals.calories;
      weeklyTotals.protein_grams += summary.totals.protein_grams;
      weeklyTotals.carbs_grams += summary.totals.carbs_grams;
      weeklyTotals.fat_grams += summary.totals.fat_grams;
      weeklyTotals.fiber_grams += summary.totals.fiber_grams;
      weeklyTotals.sugar_grams += summary.totals.sugar_grams;
      weeklyTotals.sodium_mg += summary.totals.sodium_mg;

      // Add to weekly meals
      Object.keys(weeklyMeals).forEach(mealType => {
        weeklyMeals[mealType].calories += summary.meals[mealType].calories;
        weeklyMeals[mealType].protein_grams += summary.meals[mealType].protein_grams;
        weeklyMeals[mealType].carbs_grams += summary.meals[mealType].carbs_grams;
        weeklyMeals[mealType].fat_grams += summary.meals[mealType].fat_grams;
      });
    });

    const weeklySummary = {
      start_date: start,
      end_date: end,
      daily_summaries: summaries,
      weekly_totals: weeklyTotals,
      weekly_meals: weeklyMeals,
      average_daily_calories: Math.round(weeklyTotals.calories / 7)
    };

    logger.info('Weekly summary retrieved', {
      userId,
      startDate,
      endDate: end.toISOString().split('T')[0],
      averageCalories: weeklySummary.average_daily_calories
    });

    res.json({
      success: true,
      data: weeklySummary
    });

  } catch (error) {
    logger.error('Error getting weekly summary:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve weekly summary',
        code: 'SUMMARY_RETRIEVAL_ERROR'
      }
    });
  }
});

module.exports = router;