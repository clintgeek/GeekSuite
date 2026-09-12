import express from 'express';
import { authenticateToken, lookupRole } from '../middleware/auth.js';
import APIKey, { DEFAULT_KEY_PERMISSIONS } from '../models/APIKey.js';
import { VALID_APPS } from '../config/validApps.js';
import { normalizeAppId } from '../services/callerIdentity.js';
import logger from '../lib/logger.js';

const router = express.Router();

// Apply JWT authentication to all routes (API key management requires user login)
router.use(authenticateToken);

/**
 * The permission set a key is minted with when the caller names none. The
 * model owns the one list now (`DEFAULT_KEY_PERMISSIONS`); this export keeps
 * the name the rest of the package and its tests already import.
 */
export const DEFAULT_PERMISSIONS = DEFAULT_KEY_PERMISSIONS;

/**
 * assertMintAuthority — who may mint or rotate a key for an app.
 *
 * Q62. Until 2026-09-06 any logged-in user could `POST /api/api-keys` with any
 * `appName` they liked and receive a working `bg_` credential for it. That is
 * the whole aiGeek trust model in one request: `services/callerIdentity.js`
 * routes and bills a call by the *key's* app, precisely so a body field cannot
 * choose whose AIAppConfig row answers and whose quota pays — and the mint
 * route handed out the field that decides it. A caller could mint
 * `appName: 'storygeek'`, route through storygeek's provider row, and spend
 * storygeek's free-tier allowance, from an ordinary user account.
 *
 * The rule now:
 *
 *   admin                      → may mint for any app, including one not yet
 *                                in VALID_APPS (that is how a new app gets its
 *                                first key).
 *   app is in VALID_APPS and
 *   the caller already holds an
 *   active key for it          → may mint another, and rotate the ones they
 *                                hold. This is what "owns the app" can mean
 *                                against the data that exists: there is no
 *                                owner field on models/App.js, and inventing
 *                                one would be a schema and a migration for a
 *                                registry nothing else reads that way.
 *   anyone else                → 403 admin_required.
 *
 * The consequence worth stating plainly: an app's *first* key is an admin act.
 * That is the point — it is the moment the app name stops being a string
 * anyone can type and starts being a credential.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} appName  the app the key is for (raw; normalized here)
 * @returns {Promise<boolean>} true when the response has been sent
 */
async function assertMintAuthority(req, res, appName) {
  const userId = req.user?.id;
  const app = normalizeAppId(appName);

  let role = null;
  try {
    role = await lookupRole(userId);
  } catch (err) {
    req.log.error({ err }, 'Mint authority role lookup failed');
    res.status(500).json({
      success: false,
      error: { message: 'Failed to check permissions', code: 'ROLE_CHECK_ERROR' }
    });
    return true;
  }

  if (role === 'admin') return false;

  if (app && VALID_APPS.includes(app)) {
    const holdsKeyForApp = await APIKey.exists({
      appName: app,
      createdBy: userId,
      isActive: true
    });
    if (holdsKeyForApp) return false;
  }

  req.log.warn({ app }, 'Refused to mint an API key for an app the caller does not hold');
  res.status(403).json({
    error: 'admin_required',
    message: 'admin role required to mint a key for an app you do not already hold',
    code: 'ADMIN_REQUIRED'
  });
  return true;
}

// GET /api/api-keys - List all API keys for the authenticated user
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    const apiKeys = await APIKey.find({
      createdBy: userId,
      isActive: true
    }).select('-keyHash').sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        apiKeys: apiKeys.map(key => ({
          id: key.keyId,
          name: key.name,
          appName: key.appName,
          description: key.description,
          keyPrefix: key.keyPrefix,
          permissions: key.permissions,
          rateLimit: key.rateLimit,
          usage: key.usage,
          isActive: key.isActive,
          expiresAt: key.expiresAt,
          createdAt: key.createdAt,
          updatedAt: key.updatedAt,
          isExpired: key.isExpired()
        }))
      }
    });
  } catch (error) {
    req.log.error({ err: error }, 'Error fetching API keys');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch API keys',
        code: 'FETCH_API_KEYS_ERROR'
      }
    });
  }
});

// POST /api/api-keys - Create a new API key
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      appName,
      description,
      permissions = DEFAULT_PERMISSIONS,
      rateLimit = {},
      expiresAt
    } = req.body;

    // Validate required fields
    if (!name || !appName) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Name and app name are required',
          code: 'MISSING_REQUIRED_FIELDS'
        }
      });
    }

    // Validate app name format
    if (!/^[a-zA-Z0-9_-]+$/.test(appName)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'App name can only contain letters, numbers, hyphens, and underscores',
          code: 'INVALID_APP_NAME'
        }
      });
    }

    // Who may mint for this app — see assertMintAuthority above. Placed after
    // the shape checks so a malformed request still gets its 400, and before
    // the key is generated so an unauthorized one is never created at all.
    if (await assertMintAuthority(req, res, appName)) return;

    // Generate API key
    const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();

    // Create API key document
    const apiKeyDoc = new APIKey({
      keyHash,
      keyPrefix,
      name: name.trim(),
      appName: appName.trim(),
      description: description?.trim(),
      permissions,
      rateLimit: {
        requestsPerMinute: rateLimit.requestsPerMinute || 60,
        requestsPerHour: rateLimit.requestsPerHour || 1000,
        requestsPerDay: rateLimit.requestsPerDay || 10000
      },
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: userId
    });

    await apiKeyDoc.save();

    res.status(201).json({
      success: true,
      data: {
        apiKey, // Only returned once during creation
        keyInfo: {
          id: apiKeyDoc.keyId,
          name: apiKeyDoc.name,
          appName: apiKeyDoc.appName,
          description: apiKeyDoc.description,
          keyPrefix: apiKeyDoc.keyPrefix,
          permissions: apiKeyDoc.permissions,
          rateLimit: apiKeyDoc.rateLimit,
          expiresAt: apiKeyDoc.expiresAt,
          createdAt: apiKeyDoc.createdAt
        }
      },
      message: 'API key created successfully. Please save the key securely as it will not be shown again.'
    });
  } catch (error) {
    req.log.error({ err: error }, 'Error creating API key');

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: {
          message: 'An API key with this configuration already exists',
          code: 'DUPLICATE_API_KEY'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create API key',
        code: 'CREATE_API_KEY_ERROR'
      }
    });
  }
});

// GET /api/api-keys/:keyId - Get specific API key details
router.get('/:keyId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;

    const apiKey = await APIKey.findOne({
      keyId,
      createdBy: userId,
      isActive: true
    }).select('-keyHash');

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'API key not found',
          code: 'API_KEY_NOT_FOUND'
        }
      });
    }

    res.json({
      success: true,
      data: {
        id: apiKey.keyId,
        name: apiKey.name,
        appName: apiKey.appName,
        description: apiKey.description,
        keyPrefix: apiKey.keyPrefix,
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit,
        usage: apiKey.usage,
        isActive: apiKey.isActive,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        updatedAt: apiKey.updatedAt,
        isExpired: apiKey.isExpired()
      }
    });
  } catch (error) {
    req.log.error({ err: error }, 'Error fetching API key');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch API key',
        code: 'FETCH_API_KEY_ERROR'
      }
    });
  }
});

// PUT /api/api-keys/:keyId - Update API key
router.put('/:keyId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;
    const {
      name,
      description,
      permissions,
      rateLimit,
      expiresAt,
      isActive
    } = req.body;

    const apiKey = await APIKey.findOne({
      keyId,
      createdBy: userId,
      isActive: true
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'API key not found',
          code: 'API_KEY_NOT_FOUND'
        }
      });
    }

    // Update fields
    if (name !== undefined) apiKey.name = name.trim();
    if (description !== undefined) apiKey.description = description?.trim();
    if (permissions !== undefined) apiKey.permissions = permissions;
    if (rateLimit !== undefined) {
      apiKey.rateLimit = {
        requestsPerMinute: rateLimit.requestsPerMinute || apiKey.rateLimit.requestsPerMinute,
        requestsPerHour: rateLimit.requestsPerHour || apiKey.rateLimit.requestsPerHour,
        requestsPerDay: rateLimit.requestsPerDay || apiKey.rateLimit.requestsPerDay
      };
    }
    if (expiresAt !== undefined) {
      apiKey.expiresAt = expiresAt ? new Date(expiresAt) : null;
    }
    if (isActive !== undefined) apiKey.isActive = isActive;

    apiKey.lastModifiedBy = userId;

    await apiKey.save();

    res.json({
      success: true,
      data: {
        id: apiKey.keyId,
        name: apiKey.name,
        appName: apiKey.appName,
        description: apiKey.description,
        keyPrefix: apiKey.keyPrefix,
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit,
        usage: apiKey.usage,
        isActive: apiKey.isActive,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        updatedAt: apiKey.updatedAt,
        isExpired: apiKey.isExpired()
      },
      message: 'API key updated successfully'
    });
  } catch (error) {
    req.log.error({ err: error }, 'Error updating API key');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update API key',
        code: 'UPDATE_API_KEY_ERROR'
      }
    });
  }
});

// DELETE /api/api-keys/:keyId - Delete (deactivate) API key
router.delete('/:keyId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;

    const apiKey = await APIKey.findOne({
      keyId,
      createdBy: userId,
      isActive: true
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'API key not found',
          code: 'API_KEY_NOT_FOUND'
        }
      });
    }

    // Soft delete by setting isActive to false
    apiKey.isActive = false;
    apiKey.lastModifiedBy = userId;
    await apiKey.save();

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    req.log.error({ err: error }, 'Error deleting API key');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete API key',
        code: 'DELETE_API_KEY_ERROR'
      }
    });
  }
});

// POST /api/api-keys/:keyId/regenerate - Regenerate API key
router.post('/:keyId/regenerate', async (req, res) => {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;

    const apiKeyDoc = await APIKey.findOne({
      keyId,
      createdBy: userId,
      isActive: true
    });

    if (!apiKeyDoc) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'API key not found',
          code: 'API_KEY_NOT_FOUND'
        }
      });
    }

    // The `createdBy: userId` in the query above already proves the caller
    // holds this key, so the only question left is the app: a key minted for
    // an app that is not in VALID_APPS — one that predates the mint gate, or
    // an admin's deliberate exception — stays an admin's to rotate.
    if (await assertMintAuthority(req, res, apiKeyDoc.appName)) return;

    // Generate new API key
    const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();

    // Update the document
    apiKeyDoc.keyHash = keyHash;
    apiKeyDoc.keyPrefix = keyPrefix;
    apiKeyDoc.lastModifiedBy = userId;

    // Reset usage counters
    apiKeyDoc.usage = {
      totalRequests: 0,
      lastUsed: null,
      requestsToday: 0,
      requestsThisHour: 0,
      requestsThisMinute: 0,
      lastResetDate: new Date(),
      lastResetHour: new Date().getHours(),
      lastResetMinute: new Date().getMinutes()
    };

    await apiKeyDoc.save();

    res.json({
      success: true,
      data: {
        apiKey, // Only returned once during regeneration
        keyInfo: {
          id: apiKeyDoc.keyId,
          name: apiKeyDoc.name,
          appName: apiKeyDoc.appName,
          keyPrefix: apiKeyDoc.keyPrefix,
          updatedAt: apiKeyDoc.updatedAt
        }
      },
      message: 'API key regenerated successfully. Please save the new key securely as it will not be shown again.'
    });
  } catch (error) {
    req.log.error({ err: error }, 'Error regenerating API key');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to regenerate API key',
        code: 'REGENERATE_API_KEY_ERROR'
      }
    });
  }
});

// GET /api/api-keys/apps/list - Get list of apps with API keys
router.get('/apps/list', async (req, res) => {
  try {
    const userId = req.user.id;

    const apps = await APIKey.aggregate([
      {
        $match: {
          createdBy: userId,
          isActive: true
        }
      },
      {
        $group: {
          _id: '$appName',
          keyCount: { $sum: 1 },
          totalRequests: { $sum: '$usage.totalRequests' },
          lastUsed: { $max: '$usage.lastUsed' }
        }
      },
      {
        $project: {
          appName: '$_id',
          keyCount: 1,
          totalRequests: 1,
          lastUsed: 1,
          _id: 0
        }
      },
      {
        $sort: { appName: 1 }
      }
    ]);

    res.json({
      success: true,
      data: { apps }
    });
  } catch (error) {
    req.log.error({ err: error }, 'Error fetching app list');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch app list',
        code: 'FETCH_APP_LIST_ERROR'
      }
    });
  }
});

export default router;