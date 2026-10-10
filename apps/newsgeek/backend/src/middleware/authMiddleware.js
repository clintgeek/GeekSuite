import { attachUser } from '@geeksuite/user/server';

/**
 * Session check through basegeek (the suite default). `validateSession` is
 * injectable so tests can answer the question in-process.
 *
 * NewsGeek has no member gate: any signed-in suite user may use it
 * (DOCS/NEWSGEEK_PLAN.md "Decisions": Who). Admin-only actions live in the
 * gateway, not here.
 */
export function createAuthenticate({ validateSession } = {}) {
  return attachUser(validateSession ? { validateSession } : {});
}

/** The gate for /api/me and /api/auth/me: a signed-in user, nothing more. */
export function createSessionGate(options) {
  return [createAuthenticate(options)];
}

export default { createAuthenticate, createSessionGate };
