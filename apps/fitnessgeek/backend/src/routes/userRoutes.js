import express from 'express';
const router = express.Router();
import { authenticateToken } from '../middleware/auth.js';
import logger from '../config/logger.js';
import axios from 'axios';
import UserSettings from '../models/UserSettings.js';

const BASEGEEK_URL = (process.env.BASEGEEK_URL || process.env.BASE_GEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * GET /api/users/profile
 * Get user profile information
 */
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;

    const response = await axios.get(`${BASEGEEK_URL}/api/users/me`, {
      headers: {
        Authorization: req.headers.authorization
      }
    });

    const user = response.data?.user;
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    logger.info('User profile retrieved', {
      userId,
      hasAge: !!user.profile?.age,
      hasHeight: !!user.profile?.height,
      hasGender: !!user.profile?.gender
    });

    return res.json({
      success: true,
      data: {
        username: user.username,
        email: user.email,
        age: user.profile?.age,
        height: user.profile?.height,
        gender: user.profile?.gender
      }
    });

  } catch (error) {
    logger.error('Failed to get user profile', {
      userId: req.user.id,
      error: error.message
    });

    if (!error.response) {
      return res.status(502).json({
        success: false,
        error: {
          message: `Unable to reach baseGeek user service at ${BASEGEEK_URL}`,
          code: 'BASEGEEK_UNREACHABLE'
        }
      });
    }

    return res.status(error.response.status || 500).json({
      success: false,
      error: {
        message: error.response?.data?.message || 'Failed to get user profile',
        code: error.response?.data?.code || 'PROFILE_RETRIEVAL_ERROR'
      }
    });
  }
});

/**
 * PUT /api/users/profile
 * Update user profile information
 */
// Profile fields this route relays to basegeek. `firstName`/`lastName` are on
// the list because the Profile page has always sent them and this route used to
// drop them on the floor.
const PROFILE_FIELDS = ['firstName', 'lastName', 'age', 'height', 'gender'];

router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    // Accept BOTH shapes. The frontend (`userService.updateProfile`) sends
    // `{ profile: { firstName, lastName, age, height, gender } }`, which is the
    // shape basegeek itself takes; this route only ever destructured the flat
    // spelling, so every save from the Profile page and from AIGoalPlanner's
    // "save profile" step came back 400 NO_VALID_FIELDS.
    const nested = (body.profile && typeof body.profile === 'object') ? body.profile : {};
    const readField = (key) => (body[key] !== undefined ? body[key] : nested[key]);

    const username = readField('username');
    const email = readField('email');

    const profile = {};
    for (const key of PROFILE_FIELDS) {
      const value = readField(key);
      if (value !== undefined) profile[key] = value;
    }

    const updates = {
      ...(username !== undefined ? { username } : {}),
      ...(email !== undefined ? { email } : {}),
      ...profile
    };

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'No valid fields to update',
          code: 'NO_VALID_FIELDS'
        }
      });
    }

    const payload = {
      ...(username !== undefined ? { username } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(Object.keys(profile).length ? { profile } : {})
    };

    const response = await axios.put(`${BASEGEEK_URL}/api/users/profile`, payload, {
      headers: {
        Authorization: req.headers.authorization
      }
    });

    const user = response.data?.user;
    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        }
      });
    }

    logger.info('User profile updated', {
      userId,
      updatedFields: Object.keys(updates)
    });

    return res.json({
      success: true,
      data: {
        username: user.username,
        email: user.email,
        firstName: user.profile?.firstName,
        lastName: user.profile?.lastName,
        age: user.profile?.age,
        height: user.profile?.height,
        gender: user.profile?.gender
      }
    });

  } catch (error) {
    logger.error('Failed to update user profile', {
      userId: req.user.id,
      error: error.message
    });

    if (!error.response) {
      return res.status(502).json({
        success: false,
        error: {
          message: `Unable to reach baseGeek user service at ${BASEGEEK_URL}`,
          code: 'BASEGEEK_UNREACHABLE'
        }
      });
    }

    return res.status(error.response.status || 500).json({
      success: false,
      error: {
        message: error.response?.data?.message || 'Failed to update user profile',
        code: error.response?.data?.code || 'PROFILE_UPDATE_ERROR'
      }
    });
  }
});

/**
 * GET /api/user/settings
 * Get user settings including InfluxDB preferences
 */
router.get('/settings', async (req, res) => {
  try {
    const userId = req.user.id;

    let settings = await UserSettings.findOne({ user_id: userId });

    if (!settings) {
      // Create default settings if they don't exist
      settings = new UserSettings({ user_id: userId });
      await settings.save();
    }

    logger.info('User settings retrieved', { userId });

    res.json({
      influxEnabled: settings.influxEnabled || false,
      healthBaselines: settings.healthBaselines || {
        weeklyHRV: null,
        restingHR: null,
        lastUpdated: null
      }
    });

  } catch (error) {
    logger.error('Failed to get user settings', {
      userId: req.user.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to get user settings',
      details: error.message
    });
  }
});

/**
 * PATCH /api/user/settings
 * Update user settings (InfluxDB toggle, health baselines)
 */
router.patch('/settings', async (req, res) => {
  try {
    const userId = req.user.id;
    const { influxEnabled, healthBaselines } = req.body;

    let settings = await UserSettings.findOne({ user_id: userId });

    if (!settings) {
      settings = new UserSettings({ user_id: userId });
    }

    // Update fields if provided
    if (influxEnabled !== undefined) {
      settings.influxEnabled = influxEnabled;
      logger.info('InfluxDB integration toggled', { userId, influxEnabled });
    }

    if (healthBaselines !== undefined && healthBaselines !== null) {
      if (typeof healthBaselines !== 'object' || Array.isArray(healthBaselines)) {
        return res.status(400).json({ error: 'healthBaselines must be an object' });
      }
      settings.healthBaselines = {
        weeklyHRV: healthBaselines.weeklyHRV,
        restingHR: healthBaselines.restingHR,
        lastUpdated: healthBaselines.lastUpdated || new Date()
      };
      logger.info('Health baselines updated', { userId });
    }

    await settings.save();

    res.json({
      influxEnabled: settings.influxEnabled,
      healthBaselines: settings.healthBaselines
    });

  } catch (error) {
    logger.error('Failed to update user settings', {
      userId: req.user.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to update user settings',
      details: error.message
    });
  }
});

export default router;
