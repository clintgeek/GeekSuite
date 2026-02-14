const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const UserSettings = require('../models/UserSettings');
const logger = require('../config/logger');

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/settings - Get user settings
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const settings = await UserSettings.getOrCreate(userId);

    logger.info('User settings retrieved', { userId });

    // Mask sensitive fields before sending
    const sanitized = settings.toObject();
    if (sanitized.garmin && sanitized.garmin.password) {
      sanitized.garmin.password = '********';
    }

    res.json({
      success: true,
      data: sanitized
    });

  } catch (error) {
    logger.error('Error getting user settings:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve user settings',
        code: 'SETTINGS_RETRIEVAL_ERROR'
      }
    });
  }
});

// PUT /api/settings - Update user settings
router.put('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const updateData = req.body;

    // Validate update data structure
    const allowedFields = [
      'dashboard',
      'theme',
      'notifications',
      'units',
      'ai',
      'nutrition_goal',
      'weight_goal',
      'garmin',
      'household'
    ];

    const validUpdateData = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        validUpdateData[field] = updateData[field];
      }
    });

    // If updating garmin, allow only specific keys
    if (validUpdateData.garmin) {
      const garminAllowed = ['enabled', 'username', 'password'];
      const garminUpdate = {};
      garminAllowed.forEach((k) => {
        if (validUpdateData.garmin[k] !== undefined) garminUpdate[k] = validUpdateData.garmin[k];
      });
      // Do not overwrite tokens when only updating creds/settings
      // Preserve existing token fields by using $set with dot paths below
      validUpdateData.garmin = garminUpdate;
    }

    // Use findOneAndUpdate to avoid replacing nested objects (preserve token fields)
    const settings = await UserSettings.findOneAndUpdate(
      { user_id: userId },
      validUpdateData.garmin
        ? { $set: Object.fromEntries(Object.entries(validUpdateData.garmin).map(([k, v]) => [`garmin.${k}`, v])) , ...(Object.keys(validUpdateData).some(k => k !== 'garmin') ? { $setOnInsert: {} } : {}) , ...(Object.keys(validUpdateData).some(k => ['dashboard','theme','notifications','units','ai','nutrition_goal','weight_goal'].includes(k)) ? { $set: Object.fromEntries(Object.entries(validUpdateData).filter(([k]) => ['dashboard','theme','notifications','units','ai','nutrition_goal','weight_goal'].includes(k))) } : {}) }
        : { $set: validUpdateData },
      { upsert: true, new: true }
    );

    logger.info('User settings updated', {
      userId,
      updatedFields: Object.keys(validUpdateData)
    });

    const sanitized = settings.toObject();
    if (sanitized.garmin && sanitized.garmin.password) {
      sanitized.garmin.password = '********';
    }

    res.json({
      success: true,
      data: sanitized,
      message: 'Settings updated successfully'
    });

  } catch (error) {
    logger.error('Error updating user settings:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update user settings',
        code: 'SETTINGS_UPDATE_ERROR'
      }
    });
  }
});

// PUT /api/settings/ai - Update AI settings specifically
router.put('/ai', async (req, res) => {
  try {
    const userId = req.user.id;
    const aiSettings = req.body;

    // Validate AI settings structure
    const allowedAIFields = [
      'enabled',
      'features'
    ];

    const validAISettings = {};
    allowedAIFields.forEach(field => {
      if (aiSettings[field] !== undefined) {
        validAISettings[field] = aiSettings[field];
      }
    });

    const settings = await UserSettings.updateSettings(userId, {
      ai: validAISettings
    });

    logger.info('AI settings updated', {
      userId,
      aiSettings: validAISettings
    });

    res.json({
      success: true,
      data: settings.ai,
      message: 'AI settings updated successfully'
    });

  } catch (error) {
    logger.error('Error updating AI settings:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update AI settings',
        code: 'AI_SETTINGS_UPDATE_ERROR'
      }
    });
  }
});

// PUT /api/settings/dashboard - Update dashboard settings specifically
router.put('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;
    const dashboardSettings = req.body;

    // Validate dashboard settings
    const allowedDashboardFields = [
      'show_current_weight',
      'show_blood_pressure',
      'show_calories_today',
      'show_login_streak',
      'show_nutrition_today',
      'show_garmin_summary',
      'show_quick_actions',
      'show_weight_goal',
      'show_nutrition_goal',
      'card_order'
    ];

    const validDashboardSettings = {};
    allowedDashboardFields.forEach(field => {
      if (dashboardSettings[field] !== undefined) {
        validDashboardSettings[field] = dashboardSettings[field];
      }
    });

    const settings = await UserSettings.updateSettings(userId, {
      dashboard: validDashboardSettings
    });

    logger.info('Dashboard settings updated', {
      userId,
      dashboardSettings: validDashboardSettings
    });

    res.json({
      success: true,
      data: settings.dashboard,
      message: 'Dashboard settings updated successfully'
    });

  } catch (error) {
    logger.error('Error updating dashboard settings:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update dashboard settings',
        code: 'DASHBOARD_SETTINGS_UPDATE_ERROR'
      }
    });
  }
});

// GET /api/settings/household - Get household settings and members
router.get('/household', async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = await UserSettings.getOrCreate(userId);

    let members = [];
    if (settings.household?.household_id) {
      const householdMembers = await UserSettings.find({
        'household.household_id': settings.household.household_id,
        user_id: { $ne: userId }
      }).select('user_id household.display_name household.share_food_logs household.share_meals');

      members = householdMembers.map(m => ({
        user_id: m.user_id,
        display_name: m.household?.display_name || 'Household Member',
        shares_food_logs: m.household?.share_food_logs || false,
        shares_meals: m.household?.share_meals || false
      }));
    }

    res.json({
      success: true,
      data: {
        household_id: settings.household?.household_id || null,
        display_name: settings.household?.display_name || null,
        share_food_logs: settings.household?.share_food_logs ?? true,
        share_weight: settings.household?.share_weight ?? false,
        share_meals: settings.household?.share_meals ?? true,
        members
      }
    });

  } catch (error) {
    logger.error('Error getting household settings:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve household settings',
        code: 'HOUSEHOLD_SETTINGS_ERROR'
      }
    });
  }
});

// POST /api/settings/household/create - Create a new household
router.post('/household/create', async (req, res) => {
  try {
    const userId = req.user.id;
    const { display_name } = req.body;

    const settings = await UserSettings.getOrCreate(userId);

    if (settings.household?.household_id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'You are already part of a household. Leave first to create a new one.',
          code: 'ALREADY_IN_HOUSEHOLD'
        }
      });
    }

    // Generate a unique household ID
    const householdId = crypto.randomBytes(6).toString('hex').toUpperCase();

    settings.household = {
      household_id: householdId,
      display_name: display_name || 'Me',
      share_food_logs: true,
      share_weight: false,
      share_meals: true
    };

    await settings.save();

    logger.info('Household created', { userId, householdId });

    res.status(201).json({
      success: true,
      data: {
        household_id: householdId,
        display_name: settings.household.display_name,
        message: 'Household created! Share this code with family members: ' + householdId
      }
    });

  } catch (error) {
    logger.error('Error creating household:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create household',
        code: 'HOUSEHOLD_CREATE_ERROR'
      }
    });
  }
});

// POST /api/settings/household/join - Join an existing household
router.post('/household/join', async (req, res) => {
  try {
    const userId = req.user.id;
    const { household_id, display_name } = req.body;

    if (!household_id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Household ID is required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    const settings = await UserSettings.getOrCreate(userId);

    if (settings.household?.household_id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'You are already part of a household. Leave first to join another.',
          code: 'ALREADY_IN_HOUSEHOLD'
        }
      });
    }

    // Verify the household exists
    const existingMember = await UserSettings.findOne({
      'household.household_id': household_id.toUpperCase()
    });

    if (!existingMember) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Household not found. Check the code and try again.',
          code: 'HOUSEHOLD_NOT_FOUND'
        }
      });
    }

    settings.household = {
      household_id: household_id.toUpperCase(),
      display_name: display_name || 'Family Member',
      share_food_logs: true,
      share_weight: false,
      share_meals: true
    };

    await settings.save();

    logger.info('Joined household', { userId, householdId: household_id });

    res.json({
      success: true,
      data: {
        household_id: household_id.toUpperCase(),
        display_name: settings.household.display_name,
        message: 'Successfully joined household!'
      }
    });

  } catch (error) {
    logger.error('Error joining household:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to join household',
        code: 'HOUSEHOLD_JOIN_ERROR'
      }
    });
  }
});

// PUT /api/settings/household - Update household sharing settings
router.put('/household', async (req, res) => {
  try {
    const userId = req.user.id;
    const { display_name, share_food_logs, share_weight, share_meals } = req.body;

    const settings = await UserSettings.getOrCreate(userId);

    if (!settings.household?.household_id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'You are not part of a household',
          code: 'NOT_IN_HOUSEHOLD'
        }
      });
    }

    // Update only provided fields
    if (display_name !== undefined) settings.household.display_name = display_name;
    if (share_food_logs !== undefined) settings.household.share_food_logs = share_food_logs;
    if (share_weight !== undefined) settings.household.share_weight = share_weight;
    if (share_meals !== undefined) settings.household.share_meals = share_meals;

    await settings.save();

    logger.info('Household settings updated', { userId });

    res.json({
      success: true,
      data: settings.household,
      message: 'Household settings updated'
    });

  } catch (error) {
    logger.error('Error updating household settings:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update household settings',
        code: 'HOUSEHOLD_UPDATE_ERROR'
      }
    });
  }
});

// DELETE /api/settings/household - Leave household
router.delete('/household', async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = await UserSettings.getOrCreate(userId);

    if (!settings.household?.household_id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'You are not part of a household',
          code: 'NOT_IN_HOUSEHOLD'
        }
      });
    }

    const oldHouseholdId = settings.household.household_id;

    settings.household = {
      household_id: undefined,
      display_name: undefined,
      share_food_logs: true,
      share_weight: false,
      share_meals: true
    };

    await settings.save();

    logger.info('Left household', { userId, oldHouseholdId });

    res.json({
      success: true,
      message: 'Successfully left household'
    });

  } catch (error) {
    logger.error('Error leaving household:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to leave household',
        code: 'HOUSEHOLD_LEAVE_ERROR'
      }
    });
  }
});

module.exports = router;