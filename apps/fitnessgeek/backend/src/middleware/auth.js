const { attachUser, optionalUser } = require('@geeksuite/user/server');

const authenticateToken = attachUser();
const optionalAuth = optionalUser();

module.exports = {
  authenticateToken,
  optionalAuth
};