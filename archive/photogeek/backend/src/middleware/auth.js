const jwt = require('jsonwebtoken');
const { attachUser } = require('@geeksuite/user/server');
const User = require('../models/User');

const protect = attachUser({ model: User });

/**
 * Generate JWT token
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

module.exports = { protect, generateToken };
