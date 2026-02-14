import APIKey from '../models/APIKey.js';

export const authenticateAPIKey = (requiredPermission = null) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'];

      // Check for API key in Authorization header (Bearer token format)
      let apiKey = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.substring(7);
      }

      // Also check for API key in x-api-key header
      if (!apiKey) {
        apiKey = req.headers['x-api-key'];
      }

      if (!apiKey) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'API key required',
            code: 'API_KEY_REQUIRED'
          }
        });
      }

      // Validate API key format
      if (!apiKey.startsWith('bg_') || apiKey.length !== 67) { // bg_ + 64 hex chars
        return res.status(401).json({
          success: false,
          error: {
            message: 'Invalid API key format',
            code: 'INVALID_API_KEY_FORMAT'
          }
        });
      }

      // Extract prefix for efficient lookup
      const keyPrefix = apiKey.substring(0, 11); // bg_ + first 8 chars

      // Find API key in database
      const keyHash = APIKey.hashAPIKey(apiKey);
      const apiKeyDoc = await APIKey.findOne({
        keyPrefix: keyPrefix,
        keyHash: keyHash,
        isActive: true
      });

      if (!apiKeyDoc) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'Invalid API key',
            code: 'INVALID_API_KEY'
          }
        });
      }

      // Check if API key is expired
      if (apiKeyDoc.isExpired()) {
        return res.status(401).json({
          success: false,
          error: {
            message: 'API key has expired',
            code: 'API_KEY_EXPIRED'
          }
        });
      }

      // Check rate limits
      const rateLimitCheck = apiKeyDoc.checkRateLimit();
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: {
            message: rateLimitCheck.reason,
            code: 'RATE_LIMIT_EXCEEDED'
          }
        });
      }

      // Check permissions if required
      if (requiredPermission && !apiKeyDoc.hasPermission(requiredPermission)) {
        return res.status(403).json({
          success: false,
          error: {
            message: `Permission '${requiredPermission}' required`,
            code: 'INSUFFICIENT_PERMISSIONS'
          }
        });
      }

      // Increment usage counters
      apiKeyDoc.incrementUsage();
      await apiKeyDoc.save();

      // Add API key info to request
      req.apiKey = {
        id: apiKeyDoc.keyId,
        name: apiKeyDoc.name,
        appName: apiKeyDoc.appName,
        permissions: apiKeyDoc.permissions,
        rateLimit: apiKeyDoc.rateLimit,
        usage: apiKeyDoc.usage
      };

      // For compatibility with existing code that expects req.user
      req.user = {
        id: `apikey_${apiKeyDoc.keyId}`,
        app: apiKeyDoc.appName,
        type: 'api_key'
      };

      next();
    } catch (error) {
      console.error('API key authentication error:', error);
      return res.status(500).json({
        success: false,
        error: {
          message: 'Authentication error',
          code: 'AUTH_ERROR'
        }
      });
    }
  };
};

// Middleware that accepts both JWT and API key authentication
export const authenticateJWTOrAPIKey = (requiredPermission = null) => {
  return async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'];

    // If we have an API key header or Bearer token that looks like an API key, use API key auth
    if (apiKeyHeader || (authHeader && authHeader.startsWith('Bearer bg_'))) {
      return authenticateAPIKey(requiredPermission)(req, res, next);
    }

    // Otherwise, fall back to JWT authentication
    const { authenticateToken } = await import('./auth.js');
    return authenticateToken(req, res, next);
  };
};

// Helper function to check permissions in route handlers
export const checkPermission = (req, permission) => {
  // If using API key authentication, check permissions
  if (req.user && req.user.type === 'api_key' && req.apiKey) {
    return req.apiKey.permissions.includes(permission);
  }
  // JWT users have all permissions by default
  return true;
};

// Helper function to require permission in route handler
export const requirePermission = (req, res, permission) => {
  if (!checkPermission(req, permission)) {
    return res.status(403).json({
      success: false,
      error: {
        message: `Permission '${permission}' required`,
        code: 'INSUFFICIENT_PERMISSIONS'
      }
    });
  }
  return null; // No error
};