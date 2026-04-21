/**
 * OAuthConnection model
 *
 * Household-wide OAuth token storage. Any SSO-logged-in user can connect a
 * provider (Google, Spotify, …); the resulting access + refresh tokens are
 * stored encrypted at rest via cryptoVault and refreshed centrally by the
 * oauthRefreshJobService.
 *
 * Never store plaintext tokens. Never return token material from HTTP
 * responses — use listConnections() in oauthConnectionService.js for that.
 */

import mongoose from 'mongoose';
import { encrypt, safeDecrypt } from '../lib/cryptoVault.js';

const OAUTH_PROVIDERS = ['google', 'spotify'];

const oauthConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: OAUTH_PROVIDERS,
      required: true,
    },
    providerAccountId: {
      type: String,
      default: null,
    },
    accessTokenEncrypted: {
      type: String,
      default: null,
    },
    refreshTokenEncrypted: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    scopes: {
      type: [String],
      default: [],
    },
    lastRefreshedAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// One connection per (user, provider)
oauthConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

// ---------------------------------------------------------------------------
// Instance methods — decrypt on demand. Never log the return value.
// ---------------------------------------------------------------------------

oauthConnectionSchema.methods.getAccessToken = function getAccessToken() {
  if (!this.accessTokenEncrypted) return null;
  return safeDecrypt(this.accessTokenEncrypted);
};

oauthConnectionSchema.methods.getRefreshToken = function getRefreshToken() {
  if (!this.refreshTokenEncrypted) return null;
  return safeDecrypt(this.refreshTokenEncrypted);
};

// ---------------------------------------------------------------------------
// Static helper: encrypt + assign + save in one call.
//
// If refreshToken is undefined / null / '' the existing refresh token on the
// document is preserved (providers sometimes omit refresh_token on refresh).
// ---------------------------------------------------------------------------

oauthConnectionSchema.statics.setTokens = async function setTokens(
  doc,
  { accessToken, refreshToken, expiresIn, scopes } = {}
) {
  if (!doc) throw new Error('[OAuthConnection.setTokens] doc is required');

  if (typeof accessToken === 'string' && accessToken.length > 0) {
    doc.accessTokenEncrypted = encrypt(accessToken);
  }

  if (typeof refreshToken === 'string' && refreshToken.length > 0) {
    doc.refreshTokenEncrypted = encrypt(refreshToken);
  }

  if (typeof expiresIn === 'number' && Number.isFinite(expiresIn)) {
    doc.expiresAt = new Date(Date.now() + expiresIn * 1000);
  }

  if (Array.isArray(scopes) && scopes.length > 0) {
    doc.scopes = scopes;
  }

  doc.lastRefreshedAt = new Date();
  doc.lastError = null;

  await doc.save();
  return doc;
};

const OAuthConnection = mongoose.model('OAuthConnection', oauthConnectionSchema);

export { OAUTH_PROVIDERS };
export default OAuthConnection;
