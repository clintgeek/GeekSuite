import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import APIKey from '../models/APIKey.js';

const router = express.Router();

// Apply JWT authentication to all routes (API key management requires user login)
router.use(authenticateToken);

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
    console.error('Error fetching API keys:', error);
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
      permissions = ['ai:call', 'ai:models', 'ai:providers'],
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
    console.error('Error creating API key:', error);

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
    console.error('Error fetching API key:', error);
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
    console.error('Error updating API key:', error);
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
    console.error('Error deleting API key:', error);
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
    console.error('Error regenerating API key:', error);
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
    console.error('Error fetching app list:', error);
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