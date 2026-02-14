const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth.js');
const logger = require('../config/logger.js');
const axios = require('axios');

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
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email, age, height, gender } = req.body;

    // Validate input
    const updates = {};
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (age !== undefined) updates.age = age;
    if (height !== undefined) updates.height = height;
    if (gender !== undefined) updates.gender = gender;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'No valid fields to update',
          code: 'NO_VALID_FIELDS'
        }
      });
    }

    const profile = {};
    if (age !== undefined) profile.age = age;
    if (height !== undefined) profile.height = height;
    if (gender !== undefined) profile.gender = gender;

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

    const UserSettings = require('../models/UserSettings.js');
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

    const UserSettings = require('../models/UserSettings.js');
    let settings = await UserSettings.findOne({ user_id: userId });

    if (!settings) {
      settings = new UserSettings({ user_id: userId });
    }

    // Update fields if provided
    if (influxEnabled !== undefined) {
      settings.influxEnabled = influxEnabled;
      logger.info('InfluxDB integration toggled', { userId, influxEnabled });
    }

    if (healthBaselines !== undefined) {
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

module.exports = router;
