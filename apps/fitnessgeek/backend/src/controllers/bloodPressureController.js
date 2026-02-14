const BloodPressure = require('../models/BloodPressure');
const logger = require('../config/logger');

/**
 * Get all blood pressure logs for a user
 */
const getBPLogs = async (req, res) => {
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

    const bpLogs = await BloodPressure.find(query)
      .sort({ log_date: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const total = await BloodPressure.countDocuments(query);

    logger.info(`Retrieved ${bpLogs.length} blood pressure logs for user ${userId}`);

    res.json({
      success: true,
      data: bpLogs,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Error getting blood pressure logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve blood pressure logs',
      error: error.message
    });
  }
};

/**
 * Get a single blood pressure log by ID
 */
const getBPLog = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const bpLog = await BloodPressure.findOne({ _id: id, userId });

    if (!bpLog) {
      return res.status(404).json({
        success: false,
        message: 'Blood pressure log not found'
      });
    }

    res.json({
      success: true,
      data: bpLog
    });
  } catch (error) {
    logger.error('Error getting blood pressure log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve blood pressure log',
      error: error.message
    });
  }
};

/**
 * Create a new blood pressure log
 */
const createBPLog = async (req, res) => {
  try {
    const userId = req.user.id;
    const { systolic, diastolic, pulse, log_date, notes } = req.body;

    // Validate required fields
    if (!systolic || !diastolic) {
      return res.status(400).json({
        success: false,
        message: 'Systolic and diastolic values are required'
      });
    }

    // Validate systolic > diastolic
    if (systolic <= diastolic) {
      return res.status(400).json({
        success: false,
        message: 'Systolic value must be higher than diastolic value'
      });
    }

    // Check if BP log already exists for the same date
    let checkDate;
    if (log_date) {
      if (typeof log_date === 'string' && log_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        checkDate = new Date(log_date + 'T00:00:00');
      } else {
        checkDate = new Date(log_date);
      }
    } else {
      checkDate = new Date();
    }

    const existingLog = await BloodPressure.findOne({
      userId,
      log_date: {
        $gte: checkDate,
        $lt: new Date(checkDate.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    if (existingLog) {
      return res.status(409).json({
        success: false,
        message: 'Blood pressure log already exists for this date',
        data: existingLog
      });
    }

    // Handle date properly to avoid timezone issues
    let logDate;
    if (log_date) {
      // If it's just a date string (YYYY-MM-DD), treat it as local time
      if (typeof log_date === 'string' && log_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Create date in local timezone by adding time component
        logDate = new Date(log_date + 'T00:00:00');
      } else {
        logDate = new Date(log_date);
      }
    } else {
      logDate = new Date();
    }

    const bpLog = new BloodPressure({
      userId,
      systolic: parseInt(systolic),
      diastolic: parseInt(diastolic),
      pulse: pulse ? parseInt(pulse) : null,
      log_date: logDate,
      notes: notes || ''
    });

    await bpLog.save();

    logger.info(`Created blood pressure log for user ${userId}: ${systolic}/${diastolic}${pulse ? `, pulse: ${pulse}` : ''}`);

    res.status(201).json({
      success: true,
      message: 'Blood pressure log created successfully',
      data: bpLog
    });
  } catch (error) {
    logger.error('Error creating blood pressure log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create blood pressure log',
      error: error.message
    });
  }
};

/**
 * Update an existing blood pressure log
 */
const updateBPLog = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { systolic, diastolic, pulse, log_date, notes } = req.body;

    const bpLog = await BloodPressure.findOne({ _id: id, userId });

    if (!bpLog) {
      return res.status(404).json({
        success: false,
        message: 'Blood pressure log not found'
      });
    }

    // Validate required fields
    if (!systolic || !diastolic) {
      return res.status(400).json({
        success: false,
        message: 'Systolic and diastolic values are required'
      });
    }

    // Validate systolic > diastolic
    if (systolic <= diastolic) {
      return res.status(400).json({
        success: false,
        message: 'Systolic value must be higher than diastolic value'
      });
    }

    // Update fields
    bpLog.systolic = parseInt(systolic);
    bpLog.diastolic = parseInt(diastolic);
    bpLog.pulse = pulse ? parseInt(pulse) : null;
    if (log_date) {
      // Handle date properly to avoid timezone issues
      if (typeof log_date === 'string' && log_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Create date in local timezone by adding time component
        bpLog.log_date = new Date(log_date + 'T00:00:00');
      } else {
        bpLog.log_date = new Date(log_date);
      }
    }
    if (notes !== undefined) bpLog.notes = notes;

    await bpLog.save();

    logger.info(`Updated blood pressure log ${id} for user ${userId}`);

    res.json({
      success: true,
      message: 'Blood pressure log updated successfully',
      data: bpLog
    });
  } catch (error) {
    logger.error('Error updating blood pressure log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update blood pressure log',
      error: error.message
    });
  }
};

/**
 * Delete a blood pressure log
 */
const deleteBPLog = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const bpLog = await BloodPressure.findOneAndDelete({ _id: id, userId });

    if (!bpLog) {
      return res.status(404).json({
        success: false,
        message: 'Blood pressure log not found'
      });
    }

    logger.info(`Deleted blood pressure log ${id} for user ${userId}`);

    res.json({
      success: true,
      message: 'Blood pressure log deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting blood pressure log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete blood pressure log',
      error: error.message
    });
  }
};

/**
 * Get blood pressure statistics for a user
 */
const getBPStats = async (req, res) => {
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

    const bpLogs = await BloodPressure.find(query).sort({ log_date: -1 });

    if (bpLogs.length === 0) {
      return res.json({
        success: true,
        data: {
          totalReadings: 0,
          averageSystolic: 0,
          averageDiastolic: 0,
          averagePulse: 0,
          latestReading: null,
          statusDistribution: {}
        }
      });
    }

    // Calculate statistics
    const totalReadings = bpLogs.length;
    const averageSystolic = bpLogs.reduce((sum, log) => sum + log.systolic, 0) / totalReadings;
    const averageDiastolic = bpLogs.reduce((sum, log) => sum + log.diastolic, 0) / totalReadings;

    const pulseReadings = bpLogs.filter(log => log.pulse !== null);
    const averagePulse = pulseReadings.length > 0
      ? pulseReadings.reduce((sum, log) => sum + log.pulse, 0) / pulseReadings.length
      : 0;

    const latestReading = bpLogs[0];

    // Calculate status distribution
    const statusDistribution = bpLogs.reduce((acc, log) => {
      const status = log.status;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    logger.info(`Retrieved blood pressure stats for user ${userId}`);

    res.json({
      success: true,
      data: {
        totalReadings,
        averageSystolic: Math.round(averageSystolic * 10) / 10,
        averageDiastolic: Math.round(averageDiastolic * 10) / 10,
        averagePulse: Math.round(averagePulse * 10) / 10,
        latestReading,
        statusDistribution
      }
    });
  } catch (error) {
    logger.error('Error getting blood pressure stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve blood pressure statistics',
      error: error.message
    });
  }
};

module.exports = {
  getBPLogs,
  getBPLog,
  createBPLog,
  updateBPLog,
  deleteBPLog,
  getBPStats
};