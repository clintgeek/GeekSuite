const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const LoginStreak = require('../models/LoginStreak');

// Get user's login streak
router.get('/login', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const streak = await LoginStreak.getOrCreateStreak(userId);

    res.json({
      success: true,
      data: {
        current: streak.current_streak,
        longest: streak.longest_streak,
        last_login_date: streak.last_login_date,
        streak_start_date: streak.streak_start_date
      }
    });
  } catch (error) {
    console.error('Error getting login streak:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to get login streak',
        code: 'STREAK_FETCH_ERROR'
      }
    });
  }
});

// Record a login (called when user logs in)
router.post('/login', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    const streak = await LoginStreak.getOrCreateStreak(userId);
    await streak.recordLogin();

    res.json({
      success: true,
      data: {
        current: streak.current_streak,
        longest: streak.longest_streak,
        last_login_date: streak.last_login_date,
        streak_start_date: streak.streak_start_date
      }
    });
  } catch (error) {
    console.error('Error recording login:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to record login',
        code: 'STREAK_RECORD_ERROR'
      }
    });
  }
});

module.exports = router;