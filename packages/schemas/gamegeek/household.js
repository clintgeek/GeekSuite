/**
 * The tenant boundary for gamegeek. DOCS/GameGeekPlan.md §2.1a.
 *
 * GeekSuite has no suite-level household yet (DOCS/SUITE_HOUSEHOLDS_PLAN.md).
 * Until it does, every authenticated user belongs to one default household,
 * which is exactly today's reality (two users, one house). Every gamegeek
 * query is nonetheless scoped by `householdId` from day one, so switching to
 * real households is a change to this ONE function, not a data migration.
 *
 * Both writers call this. Never read `householdId` from client input.
 */

const DEFAULT_HOUSEHOLD_ID = 'default';

/**
 * @param {{ id?: string, householdId?: string } | null | undefined} user
 *   the authenticated user (gateway `context.user`, or backend `req.user`).
 * @returns {string} the household id to scope every query by.
 * @throws when there is no authenticated user — fail closed, never unscoped.
 */
function resolveHouseholdId(user) {
  if (!user || !user.id) {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  // When suite households land, basegeek resolves membership server-side and
  // this function looks it up. Until then nothing on `user` is consulted:
  // `context.user` is built from token claims, and a claim is deliberately
  // NOT trusted to pick a tenant.
  return DEFAULT_HOUSEHOLD_ID;
}

module.exports = { DEFAULT_HOUSEHOLD_ID, resolveHouseholdId };
