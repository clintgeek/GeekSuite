const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const foodReportController = require('../controllers/foodReportController');

router.use(authenticateToken);

router.get('/overview', foodReportController.getOverview);
router.get('/trends', foodReportController.getTrends);
router.get('/export', foodReportController.exportReport);

module.exports = router;
