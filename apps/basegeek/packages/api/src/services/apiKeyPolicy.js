/**
 * apiKeyPolicy — who may mint, rotate and reshape a `bg_` key, decided once.
 *
 * A key's `appName` is the whole aiGeek trust model: `services/callerIdentity.js`
 * routes and bills a call by the key's app, so whoever can mint a key for an
 * app *is* that app. Its `permissions` decide which doors it opens
 * (`ai:director` is the strongest), and its rate limits and expiry decide for
 * how long and how hard.
 *
 * These rules used to live inside `routes/apiKeys.js` (Q62, 2026-09-06). The
 * GraphQL mutations that do the same four things — `createAPIKey`,
 * `regenerateAPIKey`, `updateAPIKey` — never got them (audit 2026-11-06, B1),
 * so the REST gate was a locked front door beside an open side door. Both
 * transports now ask this module, so the two cannot drift again.
 *
 * The rules:
 *
 *   mint / rotate authority (Q62, B1)
 *     admin                         → any app, including one not yet in
 *                                     VALID_APPS (an app's first key is an
 *                                     admin act).
 *     holds an active key for an
 *     app in VALID_APPS             → may mint another for it, and rotate the
 *                                     ones they hold. This is what "owns the
 *                                     app" can mean against the data that
 *                                     exists: models/App.js has no owner
 *                                     field, and inventing one would be a
 *                                     schema and a migration for a registry
 *                                     nothing else reads that way.
 *     anyone else                   → admin_required.
 *
 *   escalation (B2)
 *     admin                         → unrestricted.
 *     anyone else                   → may only narrow. A mint is measured
 *                                     against the *default key*
 *                                     (DEFAULT_KEY_PERMISSIONS — no
 *                                     `ai:director` — and the default limits);
 *                                     an update against the key as it stands.
 *                                     Narrowing means: permissions a subset,
 *                                     each rate limit ≤, and an expiry that is
 *                                     neither removed nor pushed later.
 *
 * Why refuse rather than clamp: a caller who asked for `ai:director` and
 * silently got a key without it learns about the difference from a 403 at
 * 2 a.m. in a backend log. Refusing names the field now.
 *
 * Equal is narrowing: the basegeek edit dialog resubmits every field on every
 * save, so a rename that echoes the key's own permissions back must pass.
 */

import APIKey, { DEFAULT_KEY_PERMISSIONS } from '../models/APIKey.js';
import { lookupRole } from '../middleware/auth.js';
import { VALID_APPS } from '../config/validApps.js';
import { normalizeAppId } from './callerIdentity.js';

/** The default limits a key is minted with — the model's schema defaults. */
export const DEFAULT_RATE_LIMIT = Object.freeze({
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  requestsPerDay: 10000,
});

const RATE_FIELDS = ['requestsPerMinute', 'requestsPerHour', 'requestsPerDay'];

/** The key a non-admin mint is measured against. */
export const DEFAULT_KEY_TERMS = Object.freeze({
  permissions: DEFAULT_KEY_PERMISSIONS,
  rateLimit: DEFAULT_RATE_LIMIT,
  expiresAt: null,
});

/**
 * Whether `user` is an admin. API-key callers are refused before the lookup:
 * a key carries no user document and its `apikey_<id>` id is not an ObjectId
 * (lookupRole would throw a CastError). Lookup failures propagate — the REST
 * route turns them into its 500 ROLE_CHECK_ERROR.
 *
 * @param {{id?: *, type?: string}|null} user
 * @returns {Promise<boolean>}
 */
export async function isAdminUser(user) {
  if (!user?.id || user.type === 'api_key') return false;
  return (await lookupRole(user.id)) === 'admin';
}

/**
 * May `user` mint (or rotate) a key for `appName`? See the header.
 *
 * @param {{id?: *, type?: string}} user
 * @param {string} appName  raw; normalized here
 * @returns {Promise<{allowed: boolean, isAdmin: boolean, app: string|null}>}
 */
export async function mintAuthority(user, appName) {
  const app = normalizeAppId(appName);
  const isAdmin = await isAdminUser(user);
  if (isAdmin) return { allowed: true, isAdmin, app };

  if (user?.id && user.type !== 'api_key' && app && VALID_APPS.includes(app)) {
    const holds = await APIKey.exists({ appName: app, createdBy: String(user.id), isActive: true });
    if (holds) return { allowed: true, isAdmin, app };
  }
  return { allowed: false, isAdmin, app };
}

/**
 * The terms a mint or update would *result in*, using the routes' existing
 * "a falsy rate field keeps the current value" convention, so the comparison
 * is against what would be stored, not against what was typed.
 *
 * @param {{permissions: string[], rateLimit: object, expiresAt: Date|null}} current
 * @param {{permissions?: string[]|null, rateLimit?: object|null, expiresAt?: *}} requested
 *        `undefined` means "unchanged"; `expiresAt: null` means "no expiry".
 */
export function resultingTerms(current, requested = {}) {
  const permissions = Array.isArray(requested.permissions)
    ? requested.permissions
    : [...(current.permissions || [])];

  const rateLimit = {};
  for (const field of RATE_FIELDS) {
    rateLimit[field] = (requested.rateLimit && requested.rateLimit[field]) || current.rateLimit?.[field];
  }

  let expiresAt = current.expiresAt ?? null;
  if (requested.expiresAt !== undefined) {
    expiresAt = requested.expiresAt ? new Date(requested.expiresAt) : null;
  }

  return { permissions, rateLimit, expiresAt };
}

/**
 * The fields on which `next` is wider than `current`. Empty means `next` only
 * narrows (or equals) `current`.
 *
 * @returns {string[]}  e.g. ['permissions', 'rateLimit.requestsPerDay', 'expiresAt']
 */
export function escalatedFields(current, next) {
  const widened = [];

  const held = new Set(current.permissions || []);
  if ((next.permissions || []).some(p => !held.has(p))) widened.push('permissions');

  for (const field of RATE_FIELDS) {
    const was = Number(current.rateLimit?.[field]);
    const now = Number(next.rateLimit?.[field]);
    if (Number.isFinite(was) && !(now <= was)) widened.push(`rateLimit.${field}`);
  }

  const wasExp = current.expiresAt ? new Date(current.expiresAt).getTime() : null;
  if (wasExp !== null) {
    const nowExp = next.expiresAt ? new Date(next.expiresAt).getTime() : null;
    if (nowExp === null || Number.isNaN(nowExp) || nowExp > wasExp) widened.push('expiresAt');
  }

  return widened;
}

/**
 * The one escalation decision both transports call.
 *
 * @param {object} opts
 * @param {boolean} opts.isAdmin
 * @param {object}  opts.current    the key as it stands, or DEFAULT_KEY_TERMS for a mint
 * @param {object}  opts.requested  the fields the caller sent (undefined = unchanged)
 * @returns {{ok: true, terms: object} | {ok: false, fields: string[], terms: object}}
 */
export function checkKeyTerms({ isAdmin, current, requested }) {
  const terms = resultingTerms(current, requested);
  if (isAdmin) return { ok: true, terms };
  const fields = escalatedFields(current, terms);
  return fields.length ? { ok: false, fields, terms } : { ok: true, terms };
}

/** The message both transports send with a refused escalation. */
export function escalationMessage(fields) {
  return `admin role required to widen an API key (${fields.join(', ')}); a non-admin may only narrow a key's permissions, rate limits and expiry`;
}

export default {
  DEFAULT_RATE_LIMIT,
  DEFAULT_KEY_TERMS,
  isAdminUser,
  mintAuthority,
  resultingTerms,
  escalatedFields,
  checkKeyTerms,
  escalationMessage,
};
