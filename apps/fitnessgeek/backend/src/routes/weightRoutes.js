const express = require('express');
const router = express.Router();
const {
  getWeightLogs,
  getWeightLog,
  createWeightLog,
  updateWeightLog,
  deleteWeightLog,
  getWeightStats
} = require('../controllers/weightController');
const { authenticateToken } = require('../middleware/auth');

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
router.post('/', authenticateToken, createWeightLog);

/**
 * @route PUT /api/weight/:id
 * @desc Update weight log
 * @access Private
 */
router.put('/:id', authenticateToken, updateWeightLog);

/**
 * @route DELETE /api/weight/:id
 * @desc Delete weight log
 * @access Private
 */
router.delete('/:id', authenticateToken, deleteWeightLog);

module.exports = router;