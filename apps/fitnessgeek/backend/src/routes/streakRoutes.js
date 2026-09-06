import express from 'express';
const router = express.Router();
import { authenticateToken } from '../middleware/auth.js';
import LoginStreak from '../models/LoginStreak.js';
import { reqLogger } from '../utils/reqLogger.js';

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
    reqLogger(req).error({ err: error }, 'Error getting login streak');
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
    reqLogger(req).error({ err: error }, 'Error recording login');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to record login',
        code: 'STREAK_RECORD_ERROR'
      }
    });
  }
});

export default router;