import { attachUser } from '@geeksuite/user/server';
import householdModule from '@geeksuite/schemas/thinggeek/household';

const { resolveHouseholdId } = householdModule;

/**
 * Session check through basegeek (the suite default). `validateSession` is
 * injectable so tests can answer the question in-process.
 */
export function createAuthenticate({ validateSession } = {}) {
  return attachUser(validateSession ? { validateSession } : {});
}

/**
 * The MEMBER GATE (DOCS/THINGGEEK_PLAN.md "Decisions": "Who sees it").
 * resolveHouseholdId() is the single authority: no user → 401, an
 * authenticated account that is not on the member list → 403 NOT_A_MEMBER.
 * Fail closed on anything unexpected. Sets req.householdId — the ONLY
 * household any handler may scope by; never read one from client input.
 */
export function requireMember(req, res, next) {
  try {
    req.householdId = resolveHouseholdId(req.user);
    return next();
  } catch (err) {
    if (err?.code === 'NOT_A_MEMBER') {
      return res.status(403).json({ code: 'NOT_A_MEMBER', message: err.message });
    }
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
}

/** authenticate + member gate, in that order. */
export function createMemberGate(options) {
  return [createAuthenticate(options), requireMember];
}

export default { createAuthenticate, requireMember, createMemberGate };
