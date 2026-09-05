/**
 * callerIdentity — who is actually calling aiGeek.
 *
 * aiGeek used to take the caller's word for it. `/api/ai/call` read
 * `config.appName` out of the request body and used that string for two
 * decisions that matter: which `AIAppConfig` row routes the call (which model
 * answers, at whose expense) and which app the usage lands against. A body
 * field is not a credential — any holder of any key or token could route
 * through, and bill, any app it cared to name. It also drifted: `fitnessGeek`,
 * `fitnessgeek` and `fitnessGeek:mealPlan` were three "apps" in the usage
 * breakdown and needed three routing rows to behave alike.
 *
 * So identity comes from the credential the caller presented, and the body
 * gets to say only one thing about it: which *feature* of that app is calling.
 *
 *   API key   → the key's `appName`. A key belongs to one app; that is the
 *               whole point of minting one per backend.
 *   JWT       → the token's `app` claim, which baseGeek mints and
 *               `authenticateToken` already validates against VALID_APPS.
 *   internal  → an in-process caller (askService) naming itself in code.
 *   otherwise → `unattributed`. Not a bucket anyone should be in, and named
 *               so it shows up in the usage table as the anomaly it is.
 *
 * `verified` answers "did the appId come from the credential?" — false for the
 * unattributed bucket and for a JWT with no `app` claim (an old token, or one
 * minted before the claim existed). The user behind such a token is still
 * known; the app is not.
 *
 * Everything here is pure. No I/O, no model imports — `models/AIAppConfig.js`
 * imports `normalizeAppId` from this file for its `normalizeAppName` static,
 * so this module must stay dependency-free.
 */

export const UNATTRIBUTED = 'unattributed';

const MAX_USER_ID = 64;
const MAX_FEATURE = 64;

/**
 * Canonical app id: lowercase, trimmed, everything from the first `:` dropped.
 *
 * The colon suffix is the old sub-app convention (`fitnessGeek:mealPlan`).
 * It survives as `feature`, not as a separate app.
 *
 * @param {*} value
 * @returns {string|null} normalized id, or null when there isn't one
 */
export function normalizeAppId(value) {
  if (typeof value !== 'string') return null;
  const base = value.split(':')[0].trim().toLowerCase();
  return base || null;
}

/**
 * Canonical feature name: lowercase, trimmed, capped.
 * @param {*} value
 * @returns {string|null}
 */
export function normalizeFeature(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase().slice(0, MAX_FEATURE);
  return trimmed || null;
}

/**
 * The `:suffix` half of a legacy `app:feature` string, if there is one.
 * @param {*} value
 * @returns {string|null}
 */
export function featureFromAppName(value) {
  if (typeof value !== 'string') return null;
  const idx = value.indexOf(':');
  if (idx === -1) return null;
  return normalizeFeature(value.slice(idx + 1));
}

/**
 * A user id we are willing to attribute usage to: a non-empty string of at
 * most 64 chars. Anything else (an object, a number, a novel) is dropped
 * rather than stored — these land in `AIUsage.userId`, which is what the
 * free-tier quota accounting groups on.
 *
 * @param {*} value
 * @returns {string|null}
 */
export function normalizeUserId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_USER_ID) return null;
  return trimmed;
}

/**
 * The feature the body is declaring, from either the modern `feature` field or
 * the legacy `appName: "app:feature"` suffix, at the top level or nested under
 * `config` (which is where `/api/ai/call` has always put its routing options).
 *
 * This is the *only* thing a request body is allowed to say about who is
 * calling. It cannot change the app, only name a slice of it.
 *
 * @param {object} body
 * @returns {string|null}
 */
export function resolveFeature(body = {}) {
  const b = body || {};
  const cfg = b.config || {};
  return (
    normalizeFeature(b.feature) ||
    normalizeFeature(cfg.feature) ||
    featureFromAppName(b.appName) ||
    featureFromAppName(cfg.appName) ||
    null
  );
}

/**
 * Whether the body is asking to be routed by its app's `AIAppConfig` row.
 *
 * Historically `/api/ai/call` inferred this: a body that named an app and no
 * provider got app routing. That inference has to survive — geekPR, codegeek
 * and anything else already deployed depends on it — but only as a *switch*.
 * The value it names is ignored; the row looked up is the resolved caller's.
 *
 * `unknown` is excluded because it is the route's own placeholder for "no app
 * named", not an app.
 *
 * @param {object} body
 * @returns {boolean}
 */
export function declaresAppRouting(body = {}) {
  const b = body || {};
  const cfg = b.config || {};
  const named = [b.appName, cfg.appName].find(v => typeof v === 'string' && v.trim());
  if (named && normalizeAppId(named) !== 'unknown') return true;
  return !!(normalizeFeature(b.feature) || normalizeFeature(cfg.feature));
}

/**
 * Resolve the caller of an authenticated aiGeek request.
 *
 * @param {import('express').Request} req  the request, after auth middleware
 * @param {object} [body]                  the parsed body (defaults to req.body)
 * @returns {{appId: string, feature: string|null, userId: string|null,
 *            source: 'api_key'|'jwt'|'internal'|'unattributed', verified: boolean}}
 */
export function resolveCaller(req, body = undefined) {
  const payload = body === undefined ? (req?.body || {}) : (body || {});
  const feature = resolveFeature(payload);
  const user = req?.user;

  // ── API key ──────────────────────────────────────────────────────────────
  // The key names the app. The body may name the *user* on whose behalf the
  // service is calling — a service key has no session, so without that every
  // call from storygeek would share one free-tier quota bucket. That is a
  // deliberate trust: a key holder is a backend we minted a key for.
  if (user?.type === 'api_key') {
    const appId = normalizeAppId(req.apiKey?.appName || user.app) || UNATTRIBUTED;
    const claimed = normalizeUserId(
      payload.userId ?? payload.config?.userId ?? payload.user
    );
    const owner = normalizeUserId(
      req.apiKey?.owner == null ? null : String(req.apiKey.owner)
    );
    return {
      appId,
      feature,
      userId: claimed || owner || normalizeUserId(user.id),
      source: 'api_key',
      verified: appId !== UNATTRIBUTED,
    };
  }

  // ── JWT ──────────────────────────────────────────────────────────────────
  // authenticateToken already rejected an `app` claim outside VALID_APPS, so a
  // claim that survived to here is one of ours. A token without one is old or
  // app-less: the user is verified, the app is not.
  if (user?.id) {
    const appId = normalizeAppId(user.app);
    return {
      appId: appId || UNATTRIBUTED,
      feature,
      userId: normalizeUserId(String(user.id)),
      source: 'jwt',
      verified: !!appId,
    };
  }

  return {
    appId: UNATTRIBUTED,
    feature,
    userId: null,
    source: UNATTRIBUTED,
    verified: false,
  };
}

/**
 * An in-process caller naming itself. Used by askService and anything else
 * that reaches aiService directly rather than over HTTP — there is no
 * credential to read, and no body to distrust.
 *
 * @param {{appId: string, userId?: *, feature?: *}} opts
 */
export function internalCaller({ appId, userId = null, feature = null }) {
  return {
    appId: normalizeAppId(appId) || UNATTRIBUTED,
    feature: normalizeFeature(feature),
    userId: normalizeUserId(userId),
    source: 'internal',
    verified: true,
  };
}

/**
 * One line per call, so "which app is burning the rotation" is answerable from
 * the logs and not only from the in-memory session stats.
 *
 * @param {import('express').Request} req
 * @param {ReturnType<typeof resolveCaller>} caller
 * @param {string} [label]
 */
export function logCaller(req, caller, label = 'ai caller') {
  const log = req?.log;
  if (!log?.debug) return;
  log.debug(
    { appId: caller.appId, feature: caller.feature, source: caller.source },
    label
  );
}

export default {
  UNATTRIBUTED,
  normalizeAppId,
  normalizeFeature,
  featureFromAppName,
  normalizeUserId,
  resolveFeature,
  declaresAppRouting,
  resolveCaller,
  internalCaller,
  logCaller,
};
