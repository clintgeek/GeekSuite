const { attachUser, optionalUser } = require('@geeksuite/user/server');
const { ForbiddenError, UnauthorizedError } = require('../utils/errors');

const authenticate = attachUser();
const optionalAuth = optionalUser();

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};

module.exports = { authenticate, optionalAuth, authorize };
