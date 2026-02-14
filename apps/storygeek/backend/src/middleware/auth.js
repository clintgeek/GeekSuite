const axios = require('axios');

const BASEGEEK_API_URL = process.env.BASEGEEK_URL ||
  process.env.BASE_GEEK_API_URL ||
  'https://basegeek.clintgeek.com/api';
const APP_SLUG = process.env.GEEK_APP_SLUG || 'storygeek';

const normalizeUser = (userPayload = {}) => {
  const normalizedId = userPayload._id || userPayload.id || userPayload.userId;
  if (!normalizedId) {
    throw new Error('Validated token did not include a user identifier');
  }

  return {
    ...userPayload,
    _id: normalizedId
  };
};

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  try {
    // Validate token with baseGeek
    const response = await axios.post(`${BASEGEEK_API_URL}/auth/validate`, {
      token,
      app: APP_SLUG
    });

    if (!response.data?.valid) {
      return res.status(403).json({ message: 'Invalid token' });
    }

    const user = normalizeUser(response.data.user);
    req.user = user;
    req.authContext = {
      token,
      app: APP_SLUG,
      permissions: response.data.permissions || [],
      refreshToken: response.data.refreshToken || null
    };
    return next();
  } catch (error) {
    const errorPayload = error.response?.data || error.message;
    console.error('Token validation error:', errorPayload);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

module.exports = { authenticateToken };