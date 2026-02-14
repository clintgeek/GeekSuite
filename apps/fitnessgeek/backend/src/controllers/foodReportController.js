const foodReportService = require('../services/foodReportService');
const logger = require('../config/logger');

const parseOptions = (query = {}) => {
  const options = {};
  if (query.start) options.start = query.start;
  if (query.days) options.days = Math.max(1, parseInt(query.days, 10) || 0);
  return options;
};

exports.getOverview = async (req, res) => {
  try {
    const data = await foodReportService.getOverview(req.user.id, parseOptions(req.query));
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Failed to build food overview report', { userId: req.user.id, error: error.message });
    res.status(500).json({ success: false, error: 'Unable to build food overview report' });
  }
};

exports.getTrends = async (req, res) => {
  try {
    const data = await foodReportService.getTrends(req.user.id, parseOptions(req.query));
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Failed to build food trends report', { userId: req.user.id, error: error.message });
    res.status(500).json({ success: false, error: 'Unable to build food trends report' });
  }
};

exports.exportReport = async (req, res) => {
  try {
    const format = (req.query.format || 'csv').toLowerCase();
    const options = parseOptions(req.query);

    if (format === 'json') {
      const data = await foodReportService.getOverview(req.user.id, options);
      res.json({ success: true, data });
      return;
    }

    const csv = await foodReportService.export(req.user.id, options);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="food-report.csv"');
    res.send(csv);
  } catch (error) {
    logger.error('Failed to export food report', { userId: req.user.id, error: error.message });
    res.status(500).json({ success: false, error: 'Unable to export food report' });
  }
};
