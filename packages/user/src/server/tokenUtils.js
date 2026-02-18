'use strict';

const axios = require('axios');

const SSO_COOKIE = 'geek_token';
const DEFAULT_BASEGEEK_URL = 'https://basegeek.clintgeek.com';

/**
 * Extract auth token from request (cookie-first, then Authorization header).
 */
function getTokenFromRequest(req, cookieName = SSO_COOKIE) {
  const authHeader = req.headers?.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookieHeader = req.headers?.cookie;
  if (cookieHeader) {
    return parseCookieValue(cookieHeader, cookieName);
  }

  return null;
}

function parseCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    const key = idx >= 0 ? trimmed.slice(0, idx) : trimmed;
    if (key !== name) continue;
    const value = idx >= 0 ? trimmed.slice(idx + 1) : '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/**
 * Normalize upstream BaseGeek user object so id fields are consistent.
 * Handles the three response shapes BaseGeek may return.
 */
function normalizeSsoUser(responseData) {
  const user = responseData?.data?.user || responseData?.user || responseData;
  if (!user) return null;

  const id = user._id || user.id || user.userId;
  return {
    ...user,
    _id: id,
    id,
    userId: id,
  };
}

/**
 * Validate a token against BaseGeek and return the normalized SSO user.
 */
async function validateToken(token, baseGeekUrl) {
  const url = (baseGeekUrl || process.env.BASEGEEK_URL || DEFAULT_BASEGEEK_URL).replace(/\/$/, '');

  const response = await axios.get(`${url}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return normalizeSsoUser(response.data);
}

module.exports = { getTokenFromRequest, normalizeSsoUser, validateToken };
