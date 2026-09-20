import { toUtcMidnight } from '@geeksuite/utils';
import BloodPressure from '../models/BloodPressure.js';
import logger from '../config/logger.js';

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
    logger.error({ err: error }, 'Error getting blood pressure logs:');
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
    logger.error({ err: error }, 'Error getting blood pressure log:');
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
    const { systolic, diastolic, pulse, log_date, measured_at, notes } = req.body;

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

    // NOTE: there used to be a `findOne` here rejecting a second reading on
    // the same calendar day ("Blood pressure log already exists for this
    // date"). Multiple readings a day (morning/evening on a home cuff) are
    // the normal case, not an error — see the shared schema's header. The
    // `(userId, measured_at)` unique index below is what now catches an
    // actual duplicate, and it's translated into a clean 409 in the catch
    // block rather than a raw 500.
    const logDate = log_date ? toUtcMidnight(log_date) : toUtcMidnight(new Date());
    // The INSTANT this reading was taken. Defaults to "now" — a manual
    // reading's instant is knowable the moment it's entered; see the shared
    // schema's header for why that default is safe here (unlike
    // BodyComposition's measured_at, which must equal a report's own
    // timestamp and carries no default).
    const measuredAt = measured_at ? new Date(measured_at) : new Date();

    const bpLog = new BloodPressure({
      userId,
      systolic: parseInt(systolic),
      diastolic: parseInt(diastolic),
      pulse: pulse ? parseInt(pulse) : null,
      log_date: logDate,
      measured_at: measuredAt,
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
    if (error?.code === 11000) {
      // The `(userId, measured_at)` unique index — this exact reading was
      // already recorded (a retried request, a double-tap, a re-import).
      // Expected traffic, not a fault: same translation as
      // bodyCompXlsxImportService.js's identical E11000 handling for the
      // sibling schema's dedupe index. Not a 500.
      logger.info({ userId: req.user?.id }, 'Blood pressure log: duplicate measured_at, already recorded');
      return res.status(409).json({
        success: false,
        message: 'This blood pressure reading has already been recorded',
        code: 'DUPLICATE_READING'
      });
    }
    logger.error({ err: error }, 'Error creating blood pressure log:');
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
    const { systolic, diastolic, pulse, log_date, measured_at, notes } = req.body;

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
      bpLog.log_date = toUtcMidnight(log_date);
    }
    if (measured_at) {
      bpLog.measured_at = new Date(measured_at);
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
    if (error?.code === 11000) {
      // Same translation as createBPLog — an edit that moves `measured_at`
      // onto a value the user already has recorded is a duplicate, not a
      // server fault.
      logger.info({ userId: req.user?.id }, 'Blood pressure log update: duplicate measured_at, already recorded');
      return res.status(409).json({
        success: false,
        message: 'This blood pressure reading has already been recorded',
        code: 'DUPLICATE_READING'
      });
    }
    logger.error({ err: error }, 'Error updating blood pressure log:');
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
    logger.error({ err: error }, 'Error deleting blood pressure log:');
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
    logger.error({ err: error }, 'Error getting blood pressure stats:');
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve blood pressure statistics',
      error: error.message
    });
  }
};

export { getBPLogs, getBPLog, createBPLog, updateBPLog, deleteBPLog, getBPStats };
export default { getBPLogs, getBPLog, createBPLog, updateBPLog, deleteBPLog, getBPStats };