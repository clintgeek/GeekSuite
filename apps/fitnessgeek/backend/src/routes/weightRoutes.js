import express from 'express';
const router = express.Router();
import { getWeightLogs, getWeightLog, createWeightLog, updateWeightLog, deleteWeightLog, getWeightStats } from '../controllers/weightController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validate } from '../validation/validate.js';
import { createWeightSchema, updateWeightSchema } from '../validation/schemas/weight.js';

/**
 * @route GET /api/weight
 * @desc Get all weight logs for user
 * @access Private
 */
router.get('/', authenticateToken, getWeightLogs);

/**
 * @route GET /api/weight/stats
 * @desc Get weight statistics for user
 * @access Private
 */
router.get('/stats', authenticateToken, getWeightStats);

/**
 * @route GET /api/weight/:id
 * @desc Get single weight log by ID
 * @access Private
 */
router.get('/:id', authenticateToken, getWeightLog);

/**
 * @route POST /api/weight
 * @desc Create new weight log
 * @access Private
 */
router.post('/', authenticateToken, validate({ body: createWeightSchema }), createWeightLog);

/**
 * @route PUT /api/weight/:id
 * @desc Update weight log
 * @access Private
 */
router.put('/:id', authenticateToken, validate({ body: updateWeightSchema }), updateWeightLog);

/**
 * @route DELETE /api/weight/:id
 * @desc Delete weight log
 * @access Private
 */
router.delete('/:id', authenticateToken, deleteWeightLog);

export default router;