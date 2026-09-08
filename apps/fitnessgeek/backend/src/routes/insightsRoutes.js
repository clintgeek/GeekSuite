/**
 * AI Insights Routes
 *
 * Endpoints for AI-powered health insights, summaries, and chat.
 *
 * **None of these answers 5xx because a model was unavailable.** Every
 * generator in `aiInsightsService` now returns `{ ok: false, reason, message }`
 * instead of throwing when aiGeek's feature door declines
 * (`apps/basegeek/DOCS/AIGEEK_FRONT_DOOR.md` §4), and each route relays that
 * as a **200** so the card can render the sentence in place instead of
 * showing an error state about an API the user has never heard of. Insight
 * prose has no deterministic fallback — a brief with the words taken out is
 * not a brief — so the friendly refusal *is* the fallback.
 *
 * The `ok` / `reason` / `message` trio is hoisted to the top level as well as
 * living inside `data`, because `data` is what the frontend's REST-shaped
 * client unwraps and the top level is what the front door's contract
 * describes. A 500 from here now means a real failure: a broken Mongo query,
 * a bug in the context builder.
 */

import express from 'express';
const router = express.Router();
import aiInsightsService from '../services/aiInsightsService.js';
import { authenticateToken } from '../middleware/auth.js';
import logger from '../config/logger.js';

// All routes require authentication
router.use(authenticateToken);

/** One shape for every insight answer, success or friendly refusal. */
const answer = (res, payload) => res.json({
  success: true,
  ok: payload?.ok !== false,
  reason: payload?.reason ?? null,
  message: payload?.message,
  data: payload
});

/**
 * A route only reaches its catch on a real failure now. Keep the 500 for
 * those, and keep the cause in the log rather than in the response.
 */
const fail = (res, what, error) => {
  logger.error(what, { error: error.message });
  return res.status(500).json({ success: false, error: what });
};

/**
 * GET /api/insights/morning-brief
 * Get AI-generated morning briefing based on yesterday's data
 */
router.get('/morning-brief', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    return answer(res, await aiInsightsService.generateMorningBrief(userId));
  } catch (error) {
    return fail(res, 'Failed to generate morning brief', error);
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
    const { date } = req.query;
    return answer(res, await aiInsightsService.generateDailySummary(userId, date));
  } catch (error) {
    return fail(res, 'Failed to generate daily summary', error);
  }
});

/**
 * GET /api/insights/correlations
 * Get AI analysis of health correlations over 30 days
 */
router.get('/correlations', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    return answer(res, await aiInsightsService.analyzeCorrelations(userId));
  } catch (error) {
    return fail(res, 'Failed to analyze correlations', error);
  }
});

/**
 * GET /api/insights/weekly-report
 * Get AI-generated weekly nutrition report summary
 */
router.get('/weekly-report', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { start, days } = req.query;
    return answer(res, await aiInsightsService.generateWeeklyReport(userId, {
      start,
      days: days ? parseInt(days, 10) : undefined
    }));
  } catch (error) {
    return fail(res, 'Failed to generate weekly report', error);
  }
});

/**
 * GET /api/insights/trend-watch
 * Get AI-generated trend highlights for longer ranges
 */
router.get('/trend-watch', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { start, days } = req.query;
    return answer(res, await aiInsightsService.generateTrendWatch(userId, {
      start,
      days: days ? parseInt(days, 10) : undefined
    }));
  } catch (error) {
    return fail(res, 'Failed to generate trend watch', error);
  }
});

/**
 * GET /api/insights/coaching
 * Get personalized coaching advice based on 2-week data
 */
router.get('/coaching', async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    return answer(res, await aiInsightsService.getCoachingAdvice(userId));
  } catch (error) {
    return fail(res, 'Failed to generate coaching advice', error);
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
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    return answer(res, await aiInsightsService.chat(userId, message, history));
  } catch (error) {
    return fail(res, 'Failed to process chat message', error);
  }
});

/**
 * GET /api/insights/context
 * Get raw user context data (for debugging/transparency)
 * Query params: days (default 7)
 *
 * No model involved — this is the aggregation the prompts are built from.
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
    return fail(res, 'Failed to build user context', error);
  }
});

export default router;
