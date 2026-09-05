import express from 'express';
const router = express.Router();
import { authenticateToken } from '../middleware/auth.js';
import * as foodReportController from '../controllers/foodReportController.js';

router.use(authenticateToken);

router.get('/overview', foodReportController.getOverview);
router.get('/trends', foodReportController.getTrends);
router.get('/export', foodReportController.exportReport);

export default router;
