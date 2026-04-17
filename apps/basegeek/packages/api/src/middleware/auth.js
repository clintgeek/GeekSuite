import jwt from 'jsonwebtoken';
import { VALID_APPS } from '../config/validApps.js';

export const authenticateToken = (req, res, next) => {
  // Cookie-first, then Bearer header
  const cookieToken = req.cookies?.geek_token;
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Validate app claim if present (for backward compatibility)
    if (decoded.app && !VALID_APPS.includes(decoded.app)) {
      return res.status(403).json({ message: 'Invalid app token' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};