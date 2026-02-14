import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/jwt.js';

// Verify JWT token middleware
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    console.warn('No token provided', { ip: req.ip, path: req.path });
    return res.status(401).json({
      success: false,
      error: {
        message: 'Access token required',
        code: 'TOKEN_REQUIRED',
      },
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
    };
    next();
  } catch (error) {
    console.error('Token verification failed', { error: error.message, ip: req.ip, path: req.path });
    return res.status(401).json({
      success: false,
      error: {
        message: 'Invalid token',
        code: 'TOKEN_INVALID',
      },
    });
  }
}

// Optional authentication middleware (for public endpoints)
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        id: decoded.id,
        email: decoded.email,
        username: decoded.username,
      };
    } catch (error) {
      console.debug && console.debug('Optional auth failed', { error: error.message });
    }
  }
  next();
}

export function requireOwner(req, res, next) {
  const headerOwner = req.header('X-Owner-Id');
  const ownerId = headerOwner || req.body?.ownerId || req.query?.ownerId;
  if (!ownerId) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'ownerId missing (use X-Owner-Id header or include in request)' } });
  }
  req.ownerId = ownerId;
  next();
}
