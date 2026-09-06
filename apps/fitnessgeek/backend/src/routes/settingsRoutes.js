import express from 'express';
const router = express.Router();
import crypto from 'crypto';
import { authenticateToken } from '../middleware/auth.js';
import UserSettings from '../models/UserSettings.js';
import logger from '../config/logger.js';
import { validate } from '../validation/validate.js';
import { settingsUpdateSchema, aiUpdateSchema, dashboardUpdateSchema, householdUpdateSchema, householdCreateSchema, householdJoinSchema } from '../validation/schemas/settings.js';
// One implementation of the dot-path rule for this backend — see the module
// header. `UserSettings.updateSettings` consumes the same helper.
import { flattenForSet } from '../utils/flattenSettingsUpdate.js';

/**
 * Strip the Garmin password out of anything headed for the client.
 *
 * The stored value is AES-256-GCM ciphertext (see the `garmin.password`
 * section of @geeksuite/schemas/fitnessgeek/userSettings). `toObject()` does
 * not run mongoose getters, so it is already the packed ciphertext here rather
 * than the plaintext — but shipping a user's ciphertext is still shipping it,
 * so the field is deleted outright and replaced with a boolean.
 *
 * This used to send `'********'`. That was worse than useless once encryption
 * landed: a client that round-tripped the GET body back into a PUT would have
 * had the literal eight asterisks encrypted and stored as the real password.
 * `password_set` cannot be echoed into a credential.
 *
 * basegeek's GraphQL `GarminSettings` type never exposed `password` at all, and
 * the frontend's Settings page rebuilds `garmin` from `enabled` + `username`
 * only, so nothing on the client reads the removed field.
 */
function sanitizeSettings(doc) {
  const sanitized = typeof doc?.toObject === 'function' ? doc.toObject() : { ...doc };
  if (sanitized.garmin) {
    sanitized.garmin = { ...sanitized.garmin };
    sanitized.garmin.password_set = !!sanitized.garmin.password;
    delete sanitized.garmin.password;
  }
  return sanitized;
}

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/settings - Get user settings
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const settings = await UserSettings.getOrCreate(userId);

    logger.info('User settings retrieved', { userId });

    // Never let the stored credential leave the API — see sanitizeSettings().
    const sanitized = sanitizeSettings(settings);

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
router.put('/', validate({ body: settingsUpdateSchema }), async (req, res) => {
  try {
    const userId = req.user.id;
    const updateData = req.body;

    // Validate update data structure.
    //
    // `household` is NOT here, deliberately, and it is not in this route's
    // contract even though the zod schema still shapes it: membership and the
    // share flags belong to PUT /household and the create/join/leave routes,
    // which enforce the "leave before you join" invariant. Accepting
    // `household.household_id` here let a client PUT any 12-hex code and graft
    // itself onto that household — member enumeration and shared food-log
    // reads — bypassing that check entirely. basegeek's gateway strips
    // `household` from `updateFitnessUserSettings` for exactly this reason;
    // this is the same rule, in the same words. (BURN_REVIEW #9.)
    const allowedFields = [
      'dashboard',
      'theme',
      'notifications',
      'units',
      'ai',
      'nutrition_goal',
      'weight_goal',
      'garmin'
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

    // ONE `$set`, dot paths throughout.
    //
    // This used to compose an object literal with TWO `$set` keys — the Garmin
    // one first, then a second for the ordinary fields — and the second
    // silently won. Any body carrying both (`{garmin:{...}, theme:'dark'}`,
    // which is what the Settings page sends) dropped the Garmin write on the
    // floor, encrypted password and all. (BURN_REVIEW #6.)
    //
    // Dot paths for every sub-document, not just `garmin`: `$set` with a
    // nested object REPLACES the whole sub-document, so a partial
    // `nutrition_goal` save would erase bmr/tdee/weekly_schedule/keto the same
    // way a partial `garmin` save erased the tokens. Same rule, and the same
    // helper's twin, as the gateway's `flattenSettingsUpdate`
    // (apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js).
    const $set = flattenForSet(validUpdateData);

    const settings = await UserSettings.findOneAndUpdate(
      { user_id: userId },
      Object.keys($set).length ? { $set } : { $setOnInsert: { user_id: userId } },
      { upsert: true, new: true }
    );

    logger.info('User settings updated', {
      userId,
      updatedFields: Object.keys(validUpdateData)
    });

    const sanitized = sanitizeSettings(settings);

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
router.put('/ai', validate({ body: aiUpdateSchema }), async (req, res) => {
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
router.put('/dashboard', validate({ body: dashboardUpdateSchema }), async (req, res) => {
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
router.post('/household/create', validate({ body: householdCreateSchema }), async (req, res) => {
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
router.post('/household/join', validate({ body: householdJoinSchema }), async (req, res) => {
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
router.put('/household', validate({ body: householdUpdateSchema }), async (req, res) => {
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

export default router;