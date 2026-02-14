const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const baseGeekAIService = require('../services/baseGeekAIService');
const aiFoodPromptCacheService = require('../services/aiFoodPromptCacheService');
const fitnessGoalService = require('../services/fitnessGoalService');
const logger = require('../config/logger');

// Apply authentication to all AI routes
router.use(authenticateToken);

// AI Status endpoint
router.get('/status', async (req, res) => {
  try {
    const status = baseGeekAIService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Failed to get AI status', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get AI status',
        code: 'AI_STATUS_ERROR',
        details: error.message
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
        description,
        cacheId: cached._id?.toString?.(),
      });

      return res.json({
        success: true,
        data: cached.result,
        meta: {
          cached: true,
          cacheId: cached._id,
          lastUsedAt: cached.last_used_at,
          hitCount: cached.hit_count,
          normalizedPrompt: cached.normalized_prompt,
        },
      });
    }

    // Use the baseGeek AI service (uses API key auth, no user token needed)
    const result = await baseGeekAIService.parseFoodDescription(description, userContext);

    // Store result for future deterministic reuse
    aiFoodPromptCacheService.saveResult(userId, description, userContext, null, result);

    logger.info('AI food parsing completed', {
      userId,
      description,
      parsedItems: result.food_items?.length || 0,
      estimatedCalories: result.estimated_calories,
      confidence: result.confidence
    });

    res.json({
      success: true,
      data: result,
      meta: {
        cached: false,
      }
    });

  } catch (error) {
    logger.error('AI food parsing failed', {
      userId: req.user.id,
      description: req.body.description,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to parse food description',
        code: 'AI_PARSE_ERROR',
        details: error.message
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

    // Extract user's token from request headers
    const authHeader = req.headers['authorization'];
    const userToken = authHeader && authHeader.split(' ')[1];

    if (!userToken) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication token required',
          code: 'TOKEN_REQUIRED'
        }
      });
    }

    // Use the nutrition goal service with user's token
    const result = await fitnessGoalService.createNutritionGoals(userInput, userProfile, userToken);

    logger.info('AI nutrition goal creation completed', {
      userId,
      userInput: userInput.substring(0, 100) + '...',
      primaryGoal: result.primary_goal?.title,
      phasesCount: result.nutrition_phases?.length || 0
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('AI nutrition goal creation failed', {
      userId: req.user.id,
      userInput: req.body.userInput,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create nutrition goals',
        code: 'AI_GOAL_CREATION_ERROR',
        details: error.message
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

    // Extract user's token from request headers
    const authHeader = req.headers['authorization'];
    const userToken = authHeader && authHeader.split(' ')[1];

    if (!userToken) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication token required',
          code: 'TOKEN_REQUIRED'
        }
      });
    }

    // Use the nutrition goal service with user's token
    const result = await fitnessGoalService.generateMealPlan(goal, userProfile, userToken);

    logger.info('AI meal plan generation completed', {
      userId,
      goalTitle: goal.title,
      weeklyPlans: result.weekly_meal_plans?.length || 0
    });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('AI meal plan generation failed', {
      userId: req.user.id,
      goal: req.body.goal?.title,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to generate meal plan',
        code: 'AI_MEAL_PLAN_ERROR',
        details: error.message
      }
    });
  }
});

module.exports = router;
