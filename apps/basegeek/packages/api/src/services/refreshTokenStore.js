import { createClient } from 'redis';
import logger from '../lib/logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Key prefixes
const REFRESH_KEY = (jti) => `refresh:${jti}`;
const FAMILY_KEY  = (family) => `family:${family}`;

let client = null;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function initRefreshTokenStore() {
  client = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: 5000,
      // Disable automatic reconnects so that a boot-time failure throws
      // immediately rather than looping forever. Post-connect reconnects
      // are handled by the caller (server.js exits on init failure).
      reconnectStrategy: false,
    },
  });

  client.on('error', (err) => {
    logger.error({ err }, 'Redis client error');
  });

  try {
    await client.connect();
    logger.info('Refresh-token store (Redis) connected');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to Redis for refresh-token store');
    throw err;
  }
}

export async function closeRefreshTokenStore() {
  if (client && client.isOpen) {
    try {
      await client.quit();
      logger.info('Refresh-token store (Redis) disconnected');
    } catch (err) {
      logger.error({ err }, 'Error closing refresh-token store');
    }
  }
}

// ---------------------------------------------------------------------------
// Store operations
// ---------------------------------------------------------------------------

/**
 * Register a new refresh token jti in Redis.
 * @param {{ jti: string, userId: string, family: string, ttlSeconds: number }} opts
 */
export async function issue({ jti, userId, family, ttlSeconds }) {
  const key = REFRESH_KEY(jti);
  const value = JSON.stringify({ userId: String(userId), family });
  await client.set(key, value, { EX: ttlSeconds });
}

/**
 * Atomically retrieve-and-delete a refresh jti entry.
 * Returns { userId, family } if found, null if not found.
 * @param {string} jti
 * @returns {Promise<{ userId: string, family: string } | null>}
 */
export async function consume(jti) {
  const key = REFRESH_KEY(jti);
  const results = await client.multi().get(key).del(key).exec();
  // results[0] is the GET value, results[1] is the DEL count
  const raw = results[0];
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Mark an entire token family as revoked.
 * TTL should be slightly longer than the max refresh-token lifetime.
 * @param {string} family
 * @param {number} ttlSeconds
 */
export async function revokeFamily(family, ttlSeconds) {
  const key = FAMILY_KEY(family);
  await client.set(key, 'revoked', { EX: ttlSeconds });
}

/**
 * Check whether a token family has been revoked.
 * @param {string} family
 * @returns {Promise<boolean>}
 */
export async function isFamilyRevoked(family) {
  const key = FAMILY_KEY(family);
  return (await client.get(key)) === 'revoked';
}
