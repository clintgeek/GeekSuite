const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getUserStats, resetProgress } = require('../controllers/userController');

// All routes are protected
router.use(protect);

router.get('/stats', getUserStats);
router.post('/reset', resetProgress);

module.exports = router;
