import express from 'express';
import { toUtcMidnight } from '@geeksuite/utils';
const router = express.Router();
import { authenticateToken } from '../middleware/auth.js';
import FoodLog from '../models/FoodLog.js';
import DailySummary from '../models/DailySummary.js';
import UserSettings from '../models/UserSettings.js';
import logger from '../config/logger.js';
import describeAndLogService from '../services/describeAndLogService.js';

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/logs - Get food logs for a date
router.get('/', async (req, res) => {
  try {
    const { date, meal_type } = req.query;
    const userId = req.user.id;

    let logs;

    if (date) {
      logger.info({ userId, date, meal_type }, 'Querying logs for date');
      if (meal_type) {
        // Get logs for specific meal type on specific date
        logs = await FoodLog.getLogsByMealType(userId, meal_type, date);
      } else {
        // Get all logs for specific date
        logs = await FoodLog.getLogsForDate(userId, date);
      }
      logger.info({ count: logs.length, date }, 'Logs query result');
    } else {
      // Get recent logs (last 10)
      logs = await FoodLog.getRecentLogs(userId, 10);
    }

    logger.info({
      userId,
      count: logs.length,
      date: date || 'recent',
      mealType: meal_type || 'all'
    }, 'Food logs retrieved');

    res.json({
      success: true,
      data: logs
    });

  } catch (error) {
    logger.error({ err: error }, 'Error getting food logs:');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve food logs',
        code: 'LOG_RETRIEVAL_ERROR'
      }
    });
  }
});

// GET /api/logs/household - Get household members and their sharing status
router.get('/household', async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user's settings
    const userSettings = await UserSettings.getOrCreate(userId);

    if (!userSettings.household?.household_id) {
      return res.json({
        success: true,
        data: {
          household_id: null,
          members: []
        }
      });
    }

    // Find all users in the same household
    const householdMembers = await UserSettings.find({
      'household.household_id': userSettings.household.household_id,
      user_id: { $ne: userId }
    }).select('user_id household.display_name household.share_food_logs household.share_meals');

    const members = householdMembers.map(m => ({
      user_id: m.user_id,
      display_name: m.household?.display_name || 'Household Member',
      shares_food_logs: m.household?.share_food_logs || false,
      shares_meals: m.household?.share_meals || false
    }));

    logger.info({
      userId,
      householdId: userSettings.household.household_id,
      memberCount: members.length
    }, 'Household members retrieved');

    res.json({
      success: true,
      data: {
        household_id: userSettings.household.household_id,
        members
      }
    });

  } catch (error) {
    logger.error({ err: error }, 'Error getting household members:');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve household members',
        code: 'HOUSEHOLD_RETRIEVAL_ERROR'
      }
    });
  }
});

// GET /api/logs/household/:userId/:date - Get a household member's logs for a date
router.get('/household/:memberId/:date', async (req, res) => {
  try {
    const userId = req.user.id;
    const { memberId, date } = req.params;

    // Verify users are in the same household
    const [userSettings, memberSettings] = await Promise.all([
      UserSettings.getOrCreate(userId),
      UserSettings.findOne({ user_id: memberId })
    ]);

    if (!userSettings.household?.household_id) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'You are not part of a household',
          code: 'NOT_IN_HOUSEHOLD'
        }
      });
    }

    if (!memberSettings?.household?.household_id ||
        memberSettings.household.household_id !== userSettings.household.household_id) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'User is not in your household',
          code: 'NOT_SAME_HOUSEHOLD'
        }
      });
    }

    if (!memberSettings.household.share_food_logs) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'This household member has not enabled food log sharing',
          code: 'SHARING_DISABLED'
        }
      });
    }

    // Get the member's logs for the date
    const logs = await FoodLog.getLogsForDate(memberId, date);

    logger.info({
      userId,
      memberId,
      date,
      count: logs.length
    }, 'Household member logs retrieved');

    res.json({
      success: true,
      data: {
        member_name: memberSettings.household.display_name || 'Household Member',
        logs
      }
    });

  } catch (error) {
    logger.error({ err: error }, 'Error getting household member logs:');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve household member logs',
        code: 'HOUSEHOLD_LOG_RETRIEVAL_ERROR'
      }
    });
  }
});

// The two household routes MUST stay above `GET /:id`. `/logs/household` is a
// single path segment, so express matched it against `/:id` first and issued
// `FoodLog.findOne({ _id: 'household' })` — a CastError, answered as a 500.
// Same shadowing class as the frontend router bug in BURN_REVIEW #16, one
// layer down. `/logs/household/:memberId/:date` was never shadowed (three
// segments), but the pair belongs together.
// GET /api/logs/:id - Get single food log
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const log = await FoodLog.findOne({
      _id: id,
      user_id: userId
    }).populate('food_item_id');

    if (!log) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Food log not found',
          code: 'LOG_NOT_FOUND'
        }
      });
    }

    logger.info({ userId, logId: id }, 'Food log retrieved');

    res.json({
      success: true,
      data: log
    });

  } catch (error) {
    logger.error({ err: error }, 'Error getting food log:');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve food log',
        code: 'LOG_RETRIEVAL_ERROR'
      }
    });
  }
});

// GET /api/logs/date/:date - Get logs for specific date (alternative endpoint)
router.get('/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const userId = req.user.id;

    const logs = await FoodLog.getLogsForDate(userId, date);

    logger.info({
      userId,
      date,
      count: logs.length
    }, 'Food logs retrieved for date');

    res.json({
      success: true,
      data: logs
    });

  } catch (error) {
    logger.error({ err: error }, 'Error getting food logs for date:');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve food logs',
        code: 'LOG_RETRIEVAL_ERROR'
      }
    });
  }
});

// POST /api/logs/copy - Copy meal(s) from one date/meal to another
// Supports copying from own logs or household member's logs
// POST /api/logs/describe — the front door for describe-and-log.
//
// Chef says what he ate; this writes it. No search, no picking, no confirm
// step: he is on record that he will simply not use anything that makes him
// the search operator (DOCS/THE_DESCRIBE_AND_LOG_PLAN.md §1).
//
// `hour` is the caller's LOCAL clock, because the server runs UTC and cannot
// otherwise guess which meal 8pm belongs to.
router.post('/describe', async (req, res) => {
  try {
    const userId = req.user.id;
    const { text, date, hour } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Tell me what you ate', code: 'VALIDATION_ERROR' }
      });
    }
    if (!date) {
      return res.status(400).json({
        success: false,
        error: { message: 'A date is required', code: 'VALIDATION_ERROR' }
      });
    }

    const started = Date.now();
    const result = await describeAndLogService.logDescription(text, {
      userId,
      date: toUtcMidnight(date),
      hour: Number.isFinite(Number(hour)) ? Number(hour) : undefined
    });

    // Nothing recognisable as food. Say so plainly rather than logging nothing
    // and claiming success.
    if (result.logged.length === 0 && result.skipped.length === 0) {
      return res.status(422).json({
        success: false,
        error: {
          message: "I couldn't find any food in that",
          code: 'NOTHING_TO_LOG'
        }
      });
    }

    logger.info({
      userId,
      logged: result.logged.length,
      skipped: result.skipped.length,
      ms: Date.now() - started
    }, 'Describe-and-log');

    res.json({
      success: true,
      data: {
        logged: result.logged,
        skipped: result.skipped,
        logIds: result.logIds,
        questions: result.questions,
        totalCalories: result.logged.reduce((sum, item) => sum + (item.calories || 0), 0)
      }
    });

  } catch (error) {
    logger.error({ err: error }, 'Describe-and-log failed');
    res.status(500).json({
      success: false,
      error: { message: 'Could not log that. Try again.', code: 'DESCRIBE_LOG_ERROR' }
    });
  }
});

router.post('/copy', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      from_date,
      from_meal_type,
      from_user_id,  // Optional: copy from household member
      to_date,
      to_meal_type
    } = req.body;

    // Validate required fields
    if (!from_date || !to_date) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Source date and destination date are required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Determine source user (self or household member)
    let sourceUserId = userId;

    if (from_user_id && from_user_id !== userId) {
      // Verify household membership and sharing permissions
      const [userSettings, memberSettings] = await Promise.all([
        UserSettings.getOrCreate(userId),
        UserSettings.findOne({ user_id: from_user_id })
      ]);

      if (!userSettings.household?.household_id ||
          !memberSettings?.household?.household_id ||
          memberSettings.household.household_id !== userSettings.household.household_id) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Cannot copy from user outside your household',
            code: 'NOT_SAME_HOUSEHOLD'
          }
        });
      }

      if (!memberSettings.household.share_food_logs) {
        return res.status(403).json({
          success: false,
          error: {
            message: 'This household member has not enabled food log sharing',
            code: 'SHARING_DISABLED'
          }
        });
      }

      sourceUserId = from_user_id;
    }

    // Build query for source logs
    const query = {
      user_id: sourceUserId,
      log_date: toUtcMidnight(from_date)
    };

    // If specific meal type, only copy that meal
    if (from_meal_type) {
      query.meal_type = from_meal_type;
    }

    // Get source logs
    const sourceLogs = await FoodLog.find(query).populate('food_item_id');

    if (sourceLogs.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'No food logs found for the source date/meal',
          code: 'NO_LOGS_FOUND'
        }
      });
    }

    // Create new logs for destination
    const newLogs = [];
    const targetDate = toUtcMidnight(to_date);

    for (const sourceLog of sourceLogs) {
      // A log whose catalog row was hard-deleted populates to null. Reading
      // `._id` off it threw mid-loop, so one orphaned log turned the whole
      // copy into a 500 and left the already-created rows behind. Skip it.
      if (!sourceLog.food_item_id) continue;

      // Determine target meal type
      const targetMealType = to_meal_type || sourceLog.meal_type;

      const newLog = new FoodLog({
        user_id: userId,
        food_item_id: sourceLog.food_item_id._id,
        log_date: targetDate,
        meal_type: targetMealType,
        servings: sourceLog.servings,
        notes: sourceLog.notes ? `(Copied) ${sourceLog.notes}` : '',
        nutrition: sourceLog.nutrition
      });

      const savedLog = await newLog.save();
      newLogs.push(savedLog);
    }

    if (newLogs.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'No food logs found for the source date/meal',
          code: 'NO_LOGS_FOUND'
        }
      });
    }

    // Update daily summary for destination date
    await DailySummary.updateFromLogs(userId, to_date);

    // Get populated logs for response
    const populatedLogs = await FoodLog.find({
      _id: { $in: newLogs.map(l => l._id) }
    }).populate('food_item_id');

    logger.info({
      userId,
      fromDate: from_date,
      fromMeal: from_meal_type || 'all',
      toDate: to_date,
      toMeal: to_meal_type || 'same',
      count: newLogs.length
    }, 'Meal copied');

    res.status(201).json({
      success: true,
      data: populatedLogs,
      message: `Copied ${newLogs.length} food log(s) successfully`
    });

  } catch (error) {
    logger.error({ err: error }, 'Error copying meal:');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to copy meal',
        code: 'MEAL_COPY_ERROR'
      }
    });
  }
});

export default router;