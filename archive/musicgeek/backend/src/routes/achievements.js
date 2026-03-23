const express = require('express');
const router = express.Router();
const achievementController = require('../controllers/achievementController');
const { optionalAuth } = require('../middleware/auth');
const { validateParams } = require('../middleware/validation');
const { userIdSchema } = require('../validators/userValidators');

// Get all achievements (public)
router.get('/', achievementController.getAllAchievements);

// Get user's achievements (optional auth for privacy)
router.get('/user/:userId', optionalAuth, validateParams(userIdSchema), achievementController.getUserAchievements);
router.get('/user', optionalAuth, achievementController.getUserAchievements);

module.exports = router;
