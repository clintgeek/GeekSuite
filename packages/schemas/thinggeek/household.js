/**
 * The tenant boundary for thinggeek, plus the MEMBER GATE.
 *
 * DOCS/THINGGEEK_PLAN.md: ThingGeek holds firearms and their serials, so
 * until suite households exist (DOCS/SUITE_HOUSEHOLDS_PLAN.md) only the
 * accounts Chef named may open it at all — the other accounts in userGeek
 * must get "not a member", enforced by BOTH the gateway and the backend.
 * Chef, 2026-09-25: "There are only two of us: clint@clintgeek.com and
 * heathergeek03@gmail.com". Changing members = editing this list + deploy.
 *
 * Never read a household or membership from client input or a token claim.
 */
const DEFAULT_HOUSEHOLD_ID = 'default';

const MEMBER_USER_IDS = Object.freeze([
  '6818c2bddcf626909f6a93a1', // clint@clintgeek.com
  '689931bbe8828efb78d11bab', // heather (heathergeek03@gmail.com)
]);

function unauthorized() {
  const err = new Error('Unauthorized');
  err.code = 'UNAUTHORIZED';
  return err;
}

function notMember() {
  const err = new Error('ThingGeek is only open to members of this household.');
  err.code = 'NOT_A_MEMBER';
  return err;
}

/** True when this authenticated user may use ThingGeek. */
function isMember(user) {
  return Boolean(user && user.id && MEMBER_USER_IDS.includes(String(user.id)));
}

/**
 * The household to scope every query by — throws UNAUTHORIZED without a user
 * and NOT_A_MEMBER for an authenticated non-member. Fail closed.
 */
function resolveHouseholdId(user) {
  if (!user || !user.id) throw unauthorized();
  if (!isMember(user)) throw notMember();
  return DEFAULT_HOUSEHOLD_ID;
}

module.exports = { DEFAULT_HOUSEHOLD_ID, MEMBER_USER_IDS, isMember, resolveHouseholdId };
