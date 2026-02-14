const express = require('express');
const router = express.Router();
const {
  getBPLogs,
  getBPLog,
  createBPLog,
  updateBPLog,
  deleteBPLog,
  getBPStats
} = require('../controllers/bloodPressureController');
const { authenticateToken } = require('../middleware/auth');

/**
 * @route GET /api/blood-pressure
 * @desc Get all blood pressure logs for user
 * @access Private
 */
router.get('/', authenticateToken, getBPLogs);

/**
 * @route GET /api/blood-pressure/stats
 * @desc Get blood pressure statistics for user
 * @access Private
 */
router.get('/stats', authenticateToken, getBPStats);

/**
 * @route GET /api/blood-pressure/:id
 * @desc Get single blood pressure log by ID
 * @access Private
 */
router.get('/:id', authenticateToken, getBPLog);

/**
 * @route POST /api/blood-pressure
 * @desc Create new blood pressure log
 * @access Private
 */
router.post('/', authenticateToken, createBPLog);

/**
 * @route PUT /api/blood-pressure/:id
 * @desc Update blood pressure log
 * @access Private
 */
router.put('/:id', authenticateToken, updateBPLog);

/**
 * @route DELETE /api/blood-pressure/:id
 * @desc Delete blood pressure log
 * @access Private
 */
router.delete('/:id', authenticateToken, deleteBPLog);

module.exports = router;