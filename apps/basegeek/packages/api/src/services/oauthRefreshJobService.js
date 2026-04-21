/**
 * oauthRefreshJobService.js
 *
 * Background daemon that keeps household OAuth tokens warm. Modelled on
 * aiHealthJobService.js: a class with start()/stop(), setInterval-driven.
 *
 * Each tick:
 *   - find every OAuthConnection where expiresAt < now + 10 minutes AND
 *     lastError is null
 *   - call oauthConnectionService.getFreshAccessToken() for each
 *   - swallow per-row errors so one bad row does not kill the tick
 */

import OAuthConnection from '../models/OAuthConnection.js';
import { getFreshAccessToken } from './oauthConnectionService.js';
import logger from '../lib/logger.js';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const REFRESH_WINDOW_MS = 10 * 60 * 1000; // refresh anything expiring in <10m

class OAuthRefreshJobService {
  constructor({ intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    this.intervalMs = intervalMs;
    this.jobInterval = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) {
      logger.warn('[OAuthRefreshJob] already running');
      return;
    }
    this.isRunning = true;
    logger.info(
      `[OAuthRefreshJob] starting (interval: ${this.intervalMs}ms)`
    );

    // Kick off the first pass out-of-band; do not await
    this.tick().catch((err) =>
      logger.error({ err }, '[OAuthRefreshJob] initial tick failed')
    );

    this.jobInterval = setInterval(() => {
      this.tick().catch((err) =>
        logger.error({ err }, '[OAuthRefreshJob] tick failed')
      );
    }, this.intervalMs);

    if (typeof this.jobInterval.unref === 'function') {
      this.jobInterval.unref();
    }
  }

  stop() {
    if (!this.isRunning) {
      logger.warn('[OAuthRefreshJob] not running');
      return;
    }
    if (this.jobInterval) {
      clearInterval(this.jobInterval);
      this.jobInterval = null;
    }
    this.isRunning = false;
    logger.info('[OAuthRefreshJob] stopped');
  }

  async tick() {
    const cutoff = new Date(Date.now() + REFRESH_WINDOW_MS);

    const candidates = await OAuthConnection.find({
      expiresAt: { $lt: cutoff },
      $or: [{ lastError: null }, { lastError: { $exists: false } }],
      accessTokenEncrypted: { $ne: null },
    })
      .select('_id userId provider expiresAt')
      .lean();

    if (candidates.length === 0) {
      logger.debug('[OAuthRefreshJob] no connections to refresh');
      return { refreshed: 0, failed: 0, total: 0 };
    }

    logger.info(
      `[OAuthRefreshJob] refreshing ${candidates.length} connection(s)`
    );

    let refreshed = 0;
    let failed = 0;

    for (const row of candidates) {
      try {
        await getFreshAccessToken(row.userId, row.provider);
        refreshed++;
      } catch (err) {
        failed++;
        logger.warn(
          {
            err,
            provider: row.provider,
            userId: row.userId,
          },
          '[OAuthRefreshJob] refresh failed for connection'
        );
      }
    }

    logger.info(
      { refreshed, failed, total: candidates.length },
      '[OAuthRefreshJob] tick complete'
    );
    return { refreshed, failed, total: candidates.length };
  }
}

// Singleton
let instance = null;

export function getInstance() {
  if (!instance) {
    instance = new OAuthRefreshJobService();
  }
  return instance;
}

export function startOAuthRefreshJob() {
  getInstance().start();
}

export function stopOAuthRefreshJob() {
  if (instance) instance.stop();
}

export { OAuthRefreshJobService };
