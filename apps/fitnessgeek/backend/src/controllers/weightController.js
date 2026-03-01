const Weight = require('../models/Weight');
const cacheService = require('../services/cacheService');
const logger = require('../config/logger');

function toUtcMidnight(dateStr) {
  if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const date = new Date(dateStr);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Get all weight logs for a user
 */
const getWeightLogs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 100, offset = 0, startDate, endDate } = req.query;

    let query = { userId };

    // Add date range filter if provided
    if (startDate || endDate) {
      query.log_date = {};
      if (startDate) {
        query.log_date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.log_date.$lte = new Date(endDate);
      }
    }

    const weightLogs = await Weight.find(query)
      .sort({ log_date: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await Weight.countDocuments(query);

    logger.info(`Retrieved ${weightLogs.length} weight logs for user ${userId}`);

    res.json({
      success: true,
      data: weightLogs,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Error getting weight logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve weight logs',
      error: error.message
    });
  }
};

/**
 * Get a single weight log by ID
 */
const getWeightLog = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const weightLog = await Weight.findOne({ _id: id, userId });

    if (!weightLog) {
      return res.status(404).json({
        success: false,
        message: 'Weight log not found'
      });
    }

    res.json({
      success: true,
      data: weightLog
    });
  } catch (error) {
    logger.error('Error getting weight log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve weight log',
      error: error.message
    });
  }
};

/**
 * Create a new weight log
 */
const createWeightLog = async (req, res) => {
  try {
    const userId = req.user.id;
    const { weight_value, log_date, notes } = req.body;

    // Validate required fields
    if (!weight_value) {
      return res.status(400).json({
        success: false,
        message: 'Weight value is required'
      });
    }

    // Check if weight log already exists for the same date
    const checkDate = log_date ? toUtcMidnight(log_date) : toUtcMidnight(new Date());
    const checkEnd = new Date(checkDate);
    checkEnd.setUTCHours(23, 59, 59, 999);

    const existingLog = await Weight.findOne({
      userId,
      log_date: {
        $gte: checkDate,
        $lt: checkEnd
      }
    });

    if (existingLog) {
      return res.status(409).json({
        success: false,
        message: 'Weight log already exists for this date',
        data: existingLog
      });
    }

    const parsedDate = log_date ? toUtcMidnight(log_date) : toUtcMidnight(new Date());

    const weightLog = new Weight({
      userId,
      weight_value: parseFloat(parseFloat(weight_value).toFixed(1)),
      log_date: parsedDate,
      notes: notes || ''
    });

    await weightLog.save();

    logger.info(`Created weight log for user ${userId}: ${weight_value}`);

    // Push to Garmin if enabled
    try {
      const UserSettings = require('../models/UserSettings');
      const settings = await UserSettings.getOrCreate(userId);
      if (settings?.garmin?.enabled) {
        const garmin = require('../services/garminConnectService');
        // Use local date string for clarity
        const ymd = new Date(parsedDate.getTime() - parsedDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        await garmin.updateWeightToGarmin(userId, ymd, weightLog.weight_value, Intl.DateTimeFormat().resolvedOptions().timeZone);
        logger.info(`Pushed weight to Garmin for user ${userId} on ${ymd}`);
      }
    } catch (pushErr) {
      logger.warn(`Failed to push weight to Garmin for user ${userId}: ${pushErr.message}`);
    }

    // Invalidate AI insights and reports cache (weight affects trends)
    await cacheService.invalidateUserAI(userId);
    await cacheService.invalidateUserReports(userId);

    res.status(201).json({
      success: true,
      message: 'Weight log created successfully',
      data: weightLog
    });
  } catch (error) {
    logger.error('Error creating weight log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create weight log',
      error: error.message
    });
  }
};

/**
 * Update a weight log
 */
const updateWeightLog = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { weight_value, log_date, notes } = req.body;

    const weightLog = await Weight.findOne({ _id: id, userId });

    if (!weightLog) {
      return res.status(404).json({
        success: false,
        message: 'Weight log not found'
      });
    }

    // Update fields if provided
    if (weight_value !== undefined) {
      weightLog.weight_value = parseFloat(parseFloat(weight_value).toFixed(1));
    }
    if (log_date !== undefined) {
      weightLog.log_date = toUtcMidnight(log_date);
    }
    if (notes !== undefined) {
      weightLog.notes = notes;
    }

    await weightLog.save();

    logger.info(`Updated weight log ${id} for user ${userId}`);

    // Optionally push updated weight to Garmin if log_date is today
    try {
      const UserSettings = require('../models/UserSettings');
      const settings = await UserSettings.getOrCreate(userId);
      if (settings?.garmin?.enabled) {
        const garmin = require('../services/garminConnectService');
        const ymd = new Date(weightLog.log_date.getTime() - weightLog.log_date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        await garmin.updateWeightToGarmin(userId, ymd, weightLog.weight_value, Intl.DateTimeFormat().resolvedOptions().timeZone);
        logger.info(`Pushed updated weight to Garmin for user ${userId} on ${ymd}`);
      }
    } catch (pushErr) {
      logger.warn(`Failed to push updated weight to Garmin for user ${userId}: ${pushErr.message}`);
    }

    // Invalidate AI insights and reports cache (weight affects trends)
    await cacheService.invalidateUserAI(userId);
    await cacheService.invalidateUserReports(userId);

    res.json({
      success: true,
      message: 'Weight log updated successfully',
      data: weightLog
    });
  } catch (error) {
    logger.error('Error updating weight log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update weight log',
      error: error.message
    });
  }
};

/**
 * Delete a weight log
 */
const deleteWeightLog = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const weightLog = await Weight.findOneAndDelete({ _id: id, userId });

    if (!weightLog) {
      return res.status(404).json({
        success: false,
        message: 'Weight log not found'
      });
    }

    logger.info(`Deleted weight log ${id} for user ${userId}`);

    // Invalidate AI insights and reports cache (weight affects trends)
    await cacheService.invalidateUserAI(userId);
    await cacheService.invalidateUserReports(userId);

    res.json({
      success: true,
      message: 'Weight log deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting weight log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete weight log',
      error: error.message
    });
  }
};

/**
 * Get weight statistics for a user
 */
const getWeightStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    let query = { userId };

    // Add date range filter if provided
    if (startDate || endDate) {
      query.log_date = {};
      if (startDate) {
        query.log_date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.log_date.$lte = new Date(endDate);
      }
    }

    const weightLogs = await Weight.find(query).sort({ log_date: 1 });

    if (weightLogs.length === 0) {
      return res.json({
        success: true,
        data: {
          totalEntries: 0,
          currentWeight: null,
          startWeight: null,
          lowestWeight: null,
          highestWeight: null,
          averageWeight: null,
          totalChange: null,
          weeklyChange: null,
          monthlyChange: null
        }
      });
    }

    const weights = weightLogs.map(log => log.weight_value);
    const currentWeight = weights[weights.length - 1];
    const previousWeight = weights.length > 1 ? weights[weights.length - 2] : null;
    const startWeight = weights[0];
    const lowestWeight = Math.min(...weights);
    const highestWeight = Math.max(...weights);
    const averageWeight = weights.reduce((sum, weight) => sum + weight, 0) / weights.length;
    const totalChange = currentWeight - startWeight;

    // Calculate weekly and monthly changes using start-of-day boundaries
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const startOfWeekAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonthAgo = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Helper: find reference log as the most recent log at or before cutoff;
    // if none, fall back to the earliest log at or after cutoff.
    const findReferenceLog = (logs, cutoff) => {
      // logs are sorted ascending by log_date
      let beforeIdx = -1;
      for (let i = logs.length - 1; i >= 0; i--) {
        if (logs[i].log_date <= cutoff) {
          beforeIdx = i;
          break;
        }
      }
      if (beforeIdx !== -1) return logs[beforeIdx];
      return logs.find(l => l.log_date >= cutoff) || null;
    };

    const weekAgoLog = findReferenceLog(weightLogs, startOfWeekAgo);
    const monthAgoLog = findReferenceLog(weightLogs, startOfMonthAgo);

    const weeklyChange = weekAgoLog ? currentWeight - weekAgoLog.weight_value : null;
    const monthlyChange = monthAgoLog ? currentWeight - monthAgoLog.weight_value : null;

    res.json({
      success: true,
      data: {
        totalEntries: weightLogs.length,
        currentWeight,
        startWeight,
        lowestWeight,
        highestWeight,
        averageWeight: parseFloat(averageWeight.toFixed(1)),
        totalChange: parseFloat(totalChange.toFixed(1)),
        weeklyChange: weekAgoLog ? parseFloat(weeklyChange.toFixed(1)) : null,
        monthlyChange: monthAgoLog ? parseFloat(monthlyChange.toFixed(1)) : null,
        recentChange: previousWeight != null ? parseFloat((currentWeight - previousWeight).toFixed(1)) : null
      }
    });
  } catch (error) {
    logger.error('Error getting weight stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve weight statistics',
      error: error.message
    });
  }
};

module.exports = {
  getWeightLogs,
  getWeightLog,
  createWeightLog,
  updateWeightLog,
  deleteWeightLog,
  getWeightStats
};