import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import APIKey, { DEFAULT_KEY_PERMISSIONS } from '../models/APIKey.js';
import { invalidateStatusCache } from '../services/aiStatusService.js';
import {
  mintAuthority,
  isAdminUser,
  checkKeyTerms,
  escalationMessage,
  DEFAULT_KEY_TERMS
} from '../services/apiKeyPolicy.js';

const router = express.Router();

// Apply JWT authentication to all routes (API key management requires user login)
router.use(authenticateToken);

// Every write here changes what `GET /api/ai/status` reports (keys per app,
// keys expiring), and that document is memoized for 60 s. Drop the memo just
// before a successful write answers, so the page shows the change.
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 400) invalidateStatusCache();
    return json(body);
  };
  return next();
});

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
 * route handed out the field that decides it.
 *
 * The rule (admin; or the caller already holds an active key for an app in
 * VALID_APPS; anyone else 403 admin_required) now lives in
 * `services/apiKeyPolicy.js`, because the GraphQL mutations that mint and
 * rotate keys never had it (audit 2026-11-06, B1). This wrapper only turns
 * the decision into this router's response shapes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} appName  the app the key is for (raw; normalized by the policy)
 * @returns {Promise<{sent: true} | {sent: false, isAdmin: boolean}>}
 */
async function assertMintAuthority(req, res, appName) {
  let decision;
  try {
    decision = await mintAuthority(req.user, appName);
  } catch (err) {
    req.log.error({ err }, 'Mint authority role lookup failed');
    res.status(500).json({
      success: false,
      error: { message: 'Failed to check permissions', code: 'ROLE_CHECK_ERROR' }
    });
    return { sent: true };
  }

  if (decision.allowed) return { sent: false, isAdmin: decision.isAdmin };

  req.log.warn({ app: decision.app }, 'Refused to mint an API key for an app the caller does not hold');
  res.status(403).json({
    error: 'admin_required',
    message: 'admin role required to mint a key for an app you do not already hold',
    code: 'ADMIN_REQUIRED'
  });
  return { sent: true };
}

/**
 * refuseEscalation — B2's 403. Same top-level shape as admin_required, plus
 * `fields`, so a client can say *which* part of the key it may not widen.
 */
function refuseEscalation(req, res, fields) {
  req.log.warn({ fields }, 'Refused a non-admin API key escalation');
  res.status(403).json({
    error: 'escalation_refused',
    message: escalationMessage(fields),
    code: 'ESCALATION_REFUSED',
    fields
  });
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
      permissions,
      rateLimit,
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
    const authority = await assertMintAuthority(req, res, appName);
    if (authority.sent) return;

    // B2: a non-admin mint is measured against the default key and may only
    // narrow it — holding a storygeek key is not a licence to mint storygeek
    // an `ai:director` key at the schema's rate ceiling. Unnamed fields take
    // the defaults, exactly as before.
    const check = checkKeyTerms({
      isAdmin: authority.isAdmin,
      current: DEFAULT_KEY_TERMS,
      requested: { permissions, rateLimit, expiresAt }
    });
    if (!check.ok) return refuseEscalation(req, res, check.fields);
    const terms = check.terms;

    // Generate API key
    const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();

    // Create API key document
    const apiKeyDoc = new APIKey({
      keyHash,
      keyPrefix,
      name: name.trim(),
      appName: appName.trim(),
      description: description?.trim(),
      permissions: terms.permissions,
      rateLimit: terms.rateLimit,
      expiresAt: terms.expiresAt,
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

    // B2: the creator of a key could rewrite it into a different key —
    // `ai:director`, rate limits at the schema maximum, no expiry. Only an
    // admin may widen; anyone else may narrow or leave a field as it is
    // (the edit dialog resubmits every field, so equal must pass).
    let isAdmin;
    try {
      isAdmin = await isAdminUser(req.user);
    } catch (err) {
      req.log.error({ err }, 'API key update role lookup failed');
      return res.status(500).json({
        success: false,
        error: { message: 'Failed to check permissions', code: 'ROLE_CHECK_ERROR' }
      });
    }
    const check = checkKeyTerms({
      isAdmin,
      current: apiKey,
      requested: { permissions, rateLimit: rateLimit ?? undefined, expiresAt }
    });
    if (!check.ok) return refuseEscalation(req, res, check.fields);

    // Update fields
    if (name !== undefined) apiKey.name = name.trim();
    if (description !== undefined) apiKey.description = description?.trim();
    if (permissions !== undefined) apiKey.permissions = check.terms.permissions;
    if (rateLimit !== undefined) apiKey.rateLimit = check.terms.rateLimit;
    if (expiresAt !== undefined) apiKey.expiresAt = check.terms.expiresAt;
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
    if ((await assertMintAuthority(req, res, apiKeyDoc.appName)).sent) return;

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