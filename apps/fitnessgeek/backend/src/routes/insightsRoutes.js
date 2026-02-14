/**
 * AI Insights Routes
 *
 * Endpoints for AI-powered health insights, summaries, and chat.
 */

const express = require('express');
const router = express.Router();
const aiInsightsService = require('../services/aiInsightsService');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../config/logger');

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/insights/morning-brief
 * Get AI-generated morning briefing based on yesterday's data
 */
router.get('/morning-brief', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userToken = req.headers.authorization?.replace('Bearer ', '');

    const brief = await aiInsightsService.generateMorningBrief(userId, userToken);

    res.json({
      success: true,
      data: brief
    });
  } catch (error) {
    logger.error('Error generating morning brief', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to generate morning brief',
      message: error.message
    });
  }
});

/**
 * GET /api/insights/daily-summary
 * Get AI-generated end-of-day summary
 * Query params: date (optional, defaults to today)
 */
router.get('/daily-summary', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userToken = req.headers.authorization?.replace('Bearer ', '');
    const { date } = req.query;

    const summary = await aiInsightsService.generateDailySummary(userId, userToken, date);

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error('Error generating daily summary', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to generate daily summary',
      message: error.message
    });
  }
});

/**
 * GET /api/insights/correlations
 * Get AI analysis of health correlations over 30 days
 */
router.get('/correlations', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userToken = req.headers.authorization?.replace('Bearer ', '');

    const correlations = await aiInsightsService.analyzeCorrelations(userId, userToken);

    res.json({
      success: true,
      data: correlations
    });
  } catch (error) {
    logger.error('Error analyzing correlations', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to analyze correlations',
      message: error.message
    });
  }
});

/**
 * GET /api/insights/weekly-report
 * Get AI-generated weekly nutrition report summary
 */
router.get('/weekly-report', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userToken = req.headers.authorization?.replace('Bearer ', '');
    const { start, days } = req.query;

    const report = await aiInsightsService.generateWeeklyReport(userId, userToken, {
      start,
      days: days ? parseInt(days, 10) : undefined
    });

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Error generating weekly report', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to generate weekly report',
      message: error.message
    });
  }
});

/**
 * GET /api/insights/trend-watch
 * Get AI-generated trend highlights for longer ranges
 */
router.get('/trend-watch', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userToken = req.headers.authorization?.replace('Bearer ', '');
    const { start, days } = req.query;

    const report = await aiInsightsService.generateTrendWatch(userId, userToken, {
      start,
      days: days ? parseInt(days, 10) : undefined
    });

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    logger.error('Error generating trend watch', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to generate trend watch',
      message: error.message
    });
  }
});

/**
 * GET /api/insights/coaching
 * Get personalized coaching advice based on 2-week data
 */
router.get('/coaching', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userToken = req.headers.authorization?.replace('Bearer ', '');

    const advice = await aiInsightsService.getCoachingAdvice(userId, userToken);

    res.json({
      success: true,
      data: advice
    });
  } catch (error) {
    logger.error('Error generating coaching advice', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to generate coaching advice',
      message: error.message
    });
  }
});

/**
 * POST /api/insights/chat
 * Chat with AI about your health data
 * Body: { message: string, history?: Array<{role, content}> }
 */
router.post('/chat', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userToken = req.headers.authorization?.replace('Bearer ', '');
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const response = await aiInsightsService.chat(userId, userToken, message, history);

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    logger.error('Error in AI chat', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to process chat message',
      message: error.message
    });
  }
});

/**
 * GET /api/insights/context
 * Get raw user context data (for debugging/transparency)
 * Query params: days (default 7)
 */
router.get('/context', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const days = parseInt(req.query.days) || 7;

    const context = await aiInsightsService.buildUserContext(userId, {
      daysBack: days,
      includeGarmin: true
    });

    res.json({
      success: true,
      data: context
    });
  } catch (error) {
    logger.error('Error building user context', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to build user context',
      message: error.message
    });
  }
});

module.exports = router;
