'use strict';

const { attachUser, optionalUser } = require('./attachUser.js');
const { authProxyHeaders, readCsrfHeader } = require('./authProxyHeaders.js');
const { csrfGuard, normalizeOrigin } = require('./csrfGuard.js');
const { createUserModel } = require('./createUserModel.js');
const { meHandler } = require('./meHandler.js');
const { getTokenFromRequest, normalizeSsoUser, validateToken } = require('./tokenUtils.js');

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
};
