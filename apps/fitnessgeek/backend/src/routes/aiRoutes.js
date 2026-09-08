/**
 * AI routes — the legacy REST surface for FitnessGeek's AI features.
 *
 * Three things changed here when these calls moved onto aiGeek's feature door
 * (`POST /api/ai/feature`, see apps/basegeek/DOCS/AIGEEK_FRONT_DOOR.md):
 *
 *  1. **No route 500s because a model was busy.** Every AI failure is now a
 *     200 carrying either a deterministic answer (`/parse-food`,
 *     `/create-nutrition-goals`) or the one friendly sentence
 *     (`/generate-meal-plan`). A 500 from here means a bug in here.
 *  2. **`/parse-food` is opt-in.** It reaches a model only when the user's
 *     settings say so — `ai.enabled !== false` **and**
 *     `ai.features.natural_language_food_logging === true`, the same two
 *     switches the GraphQL quick-add resolver honours
 *     (basegeek `graphql/fitnessgeek/resolvers.js`, `parseFoodEntry`). The
 *     flag defaults to **false** in `@geeksuite/schemas`: it is the opt-in,
 *     not a kill switch, so only an explicit `true` opens the model path.
 *     Opted out, the route still answers — with the deterministic split and
 *     `meta.reason = 'disabled'`.
 *  3. **No user token is forwarded.** aiGeek resolves the calling app from
 *     FitnessGeek's own service credential, so the two goal routes no longer
 *     demand a bearer token of their own beyond this router's auth.
 */

import express from 'express';
const router = express.Router();
import { authenticateToken } from '../middleware/auth.js';
import aiGeekClient, { UNAVAILABLE_MESSAGE } from '../services/aiGeekClient.js';
import aiFoodService from '../services/aiFoodService.js';
import aiFoodPromptCacheService from '../services/aiFoodPromptCacheService.js';
import fitnessGoalService from '../services/fitnessGoalService.js';
import UserSettings from '../models/UserSettings.js';
import logger from '../config/logger.js';

// Apply authentication to all AI routes
router.use(authenticateToken);

/**
 * Whether this user has opted into sending a food sentence to a model.
 *
 * Reads exactly the two paths the GraphQL quick-add reads, and fails
 * **closed**: a settings read that errors means no model call, because "we
 * could not check your preference" is not permission.
 */
async function modelAllowedFor(userId) {
  const settings = await UserSettings.findOne({ user_id: userId })
    .select('ai')
    .lean()
    .catch((error) => {
      logger.warn('AI opt-in check could not read settings — treating as opted out', {
        error: error.message
      });
      return null;
    });

  return settings?.ai?.enabled !== false &&
    settings?.ai?.features?.natural_language_food_logging === true;
}

// AI Status endpoint
router.get('/status', async (req, res) => {
  try {
    res.json({
      success: true,
      data: aiGeekClient.getStatus()
    });
  } catch (error) {
    logger.error('Failed to get AI status', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get AI status',
        code: 'AI_STATUS_ERROR'
      }
    });
  }
});

// Parse food description endpoint
router.post('/parse-food', async (req, res) => {
  try {
    const { description, userContext = {} } = req.body;
    const userId = req.user.id;

    if (!description) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Food description is required',
          code: 'MISSING_DESCRIPTION'
        }
      });
    }

    // Attempt cache lookup first for deterministic results
    const cached = await aiFoodPromptCacheService.getCachedResult(userId, description, userContext);
    if (cached?.result) {
      logger.info('AI food parsing cache hit', {
        userId,
        cacheId: cached._id?.toString?.(),
      });

      return res.json({
        success: true,
        data: cached.result,
        meta: {
          ok: true,
          source: 'cache',
          cached: true,
          cacheId: cached._id,
          lastUsedAt: cached.last_used_at,
          hitCount: cached.hit_count,
          normalizedPrompt: cached.normalized_prompt,
        },
      });
    }

    // The opt-in gate. Opted out is an answer, not an error.
    if (!(await modelAllowedFor(userId))) {
      const data = aiFoodService.deterministicParse(description);
      logger.info('AI food parsing declined by user settings — answered with the split', { userId });
      return res.json({
        success: true,
        data,
        meta: { ok: false, source: 'fallback', reason: 'disabled', cached: false }
      });
    }

    const result = await aiFoodService.parseFoodDescription(description, userContext, { userId });

    // Only a model answer is worth remembering. Caching the deterministic
    // split would hand it back on every later request for this sentence, long
    // after the free tier came back.
    if (result.ok) {
      aiFoodPromptCacheService.saveResult(userId, description, userContext, null, result.data);
    }

    logger.info('AI food parsing completed', {
      userId,
      ok: result.ok,
      source: result.source,
      reason: result.reason,
      parsedItems: result.data?.food_items?.length || 0
    });

    res.json({
      success: true,
      data: result.data,
      meta: {
        ok: result.ok,
        source: result.source,
        reason: result.reason,
        cached: false,
        provider: result.provenance?.provider || null,
        model: result.provenance?.model || null
      }
    });

  } catch (error) {
    logger.error('AI food parsing failed', {
      userId: req.user.id,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to parse food description',
        code: 'AI_PARSE_ERROR'
      }
    });
  }
});

// Create nutrition goals endpoint
router.post('/create-nutrition-goals', async (req, res) => {
  try {
    const { userInput, userProfile = {} } = req.body;
    const userId = req.user.id;

    if (!userInput) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Nutrition goal description is required',
          code: 'MISSING_GOAL_DESCRIPTION'
        }
      });
    }

    const result = await fitnessGoalService.createNutritionGoals(userInput, userProfile, userId);

    logger.info('AI nutrition goal creation completed', {
      userId,
      ok: result.ok,
      source: result.source,
      reason: result.reason
    });

    // A computed plan is a real answer even though no model served it, so it
    // rides the success envelope with `meta.source` telling the truth. Only a
    // profile too thin to compute anything leaves `data` null, and that still
    // answers 200 with the friendly sentence.
    res.json({
      success: true,
      data: result.data,
      meta: {
        ok: result.ok,
        source: result.source,
        reason: result.reason,
        message: result.data ? undefined : (result.message || UNAVAILABLE_MESSAGE)
      }
    });

  } catch (error) {
    logger.error('AI nutrition goal creation failed', {
      userId: req.user.id,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create nutrition goals',
        code: 'AI_GOAL_CREATION_ERROR'
      }
    });
  }
});

// Generate meal plan endpoint
router.post('/generate-meal-plan', async (req, res) => {
  try {
    const { goal, userProfile = {} } = req.body;
    const userId = req.user.id;

    if (!goal) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Nutrition goal is required',
          code: 'MISSING_GOAL'
        }
      });
    }

    const result = await fitnessGoalService.generateMealPlan(goal, userProfile, userId);

    logger.info('AI meal plan generation completed', {
      userId,
      ok: result.ok,
      reason: result.reason,
      weeklyPlans: result.data?.weekly_meal_plans?.length || 0
    });

    // No deterministic two-week menu exists, so an unavailable model is a
    // 200 with a sentence the UI renders in place — never a 500 and never an
    // error toast about the API.
    if (!result.ok) {
      return res.json({
        ok: false,
        reason: result.reason,
        message: result.message || UNAVAILABLE_MESSAGE
      });
    }

    res.json({
      success: true,
      data: result.data,
      meta: { ok: true, reason: null }
    });

  } catch (error) {
    logger.error('AI meal plan generation failed', {
      userId: req.user.id,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to generate meal plan',
        code: 'AI_MEAL_PLAN_ERROR'
      }
    });
  }
});

export default router;
