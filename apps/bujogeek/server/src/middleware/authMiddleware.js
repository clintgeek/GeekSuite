import axios from 'axios';
import { handleError } from '../utils/errorHandler.js';

const BASEGEEK_URL = (process.env.BASEGEEK_URL || process.env.BASE_GEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

function getCookieFromHeader(cookieHeader, name) {
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

export const authenticate = (req, res, next) => {
  try {
    const bearer = req.headers.authorization;
    const headerToken = bearer?.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : null;
    const cookieToken = getCookieFromHeader(req.headers.cookie, 'geek_token');
    const token = headerToken || cookieToken;

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    req.authToken = token;

    if (!req.headers.authorization) {
      req.headers.authorization = `Bearer ${token}`;
    }

    axios
      .get(`${BASEGEEK_URL}/api/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      .then((response) => {
        const upstreamUser = response?.data?.data?.user || response?.data?.user || response?.data;

        const normalizedId = upstreamUser?._id || upstreamUser?.id || upstreamUser?.userId;
        req.user = {
          ...upstreamUser,
          _id: normalizedId,
          id: normalizedId,
          userId: normalizedId
        };

        next();
      })
      .catch((error) => {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
          return res.status(401).json({ message: 'Unauthorized' });
        }
        return handleError(res, error);
      });
  } catch (error) {
    handleError(res, error);
  }
};