'use strict';

const { attachUser, optionalUser, sendAuthUnavailable } = require('./attachUser.js');
const { authProxyHeaders, readCsrfHeader } = require('./authProxyHeaders.js');
const { csrfGuard, normalizeOrigin } = require('./csrfGuard.js');
const { createUserModel } = require('./createUserModel.js');
const { meHandler } = require('./meHandler.js');
const {
  getTokenFromRequest,
  normalizeSsoUser,
  validateToken,
  AuthValidationError,
  invalidSession,
  sessionUnavailable,
  classifyValidationError,
  AUTH_INVALID,
  AUTH_UNAVAILABLE,
  AUTH_RETRY_AFTER_SECONDS,
} = require('./tokenUtils.js');

module.exports = {
  attachUser,
  optionalUser,
  authProxyHeaders,
  readCsrfHeader,
  csrfGuard,
  normalizeOrigin,
  createUserModel,
  meHandler,
  getTokenFromRequest,
  normalizeSsoUser,
  validateToken,
  // The "invalid token" / "could not check the token" split. An app that
  // injects its own `validateSession` throws these to say which it hit.
  sendAuthUnavailable,
  AuthValidationError,
  invalidSession,
  sessionUnavailable,
  classifyValidationError,
  AUTH_INVALID,
  AUTH_UNAVAILABLE,
  AUTH_RETRY_AFTER_SECONDS,
};
