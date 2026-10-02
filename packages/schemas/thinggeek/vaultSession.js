/**
 * The vault-session check, shared by the gateway and the backend (both read
 * `attic_vault_sessions`; only the backend creates rows, on an unlock).
 *
 * The token is 32 random bytes (base64url) in an HttpOnly, SameSite=Strict,
 * host-only cookie on thinggeek.clintgeek.com — which reaches the backend
 * (/api) and the gateway (/graphql is proxied by thinggeek's nginx vhost)
 * alike. Only its sha256 is stored, so a database read cannot replay one.
 *
 * A session is valid when ALL hold: the row exists, it belongs to THIS user
 * (another member's cookie is refused), and it is inside both lifetimes —
 * VAULT_IDLE_MS since its last Attic request and VAULT_MAX_MS since the
 * unlock. Checking and touching are one atomic findOneAndUpdate, so an
 * expired session can never be revived by a racing request.
 */
const crypto = require('crypto');
const { VAULT_IDLE_MS, VAULT_MAX_MS, VAULT_COOKIE } = require('./attic.js');

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function newVaultToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashVaultToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** The vault token from a cookie jar (req.cookies), or null when absent or malformed. */
function readVaultToken(cookies) {
  const raw = cookies && typeof cookies === 'object' ? cookies[VAULT_COOKIE] : null;
  return typeof raw === 'string' && TOKEN_RE.test(raw) ? raw : null;
}

function shape(row) {
  if (!row) return null;
  const last = new Date(row.lastSeenAt).getTime();
  const max = new Date(row.expiresAt).getTime();
  return {
    id: String(row._id),
    userId: String(row.userId),
    method: row.method,
    lastSeenAt: new Date(last),
    expiresAt: new Date(max),
    idleExpiresAt: new Date(Math.min(last + VAULT_IDLE_MS, max)),
  };
}

/**
 * The live session for (token, user, household), or null. `touch` (default
 * true) counts this request as activity: it pushes the idle deadline out.
 * @param {object} VaultSession  the mongoose model (or a fake with findOne / findOneAndUpdate)
 */
async function findVaultSession(VaultSession, { token, userId, householdId, now = new Date(), touch = true }) {
  if (!token || !TOKEN_RE.test(String(token)) || !userId || !householdId) return null;
  const filter = {
    tokenHash: hashVaultToken(token),
    userId: String(userId),
    householdId: String(householdId),
    lastSeenAt: { $gt: new Date(now.getTime() - VAULT_IDLE_MS) },
    expiresAt: { $gt: now },
  };
  const q = touch
    ? VaultSession.findOneAndUpdate(filter, { $set: { lastSeenAt: now } }, { new: true })
    : VaultSession.findOne(filter);
  const row = typeof q?.lean === 'function' ? await q.lean() : await q;
  return shape(row);
}

/** The row an unlock inserts (the caller sets the cookie to `token`). */
function vaultSessionRow({ token, userId, householdId, method, now = new Date() }) {
  return {
    tokenHash: hashVaultToken(token),
    userId: String(userId),
    householdId: String(householdId),
    method,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + VAULT_MAX_MS),
  };
}

module.exports = {
  VAULT_COOKIE,
  VAULT_IDLE_MS,
  VAULT_MAX_MS,
  newVaultToken,
  hashVaultToken,
  readVaultToken,
  findVaultSession,
  vaultSessionRow,
};
