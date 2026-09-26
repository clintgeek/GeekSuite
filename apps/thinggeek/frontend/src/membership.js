/**
 * The member gate, as the frontend sees it (DOCS/THINGGEEK_PLAN.md "Who sees
 * it"). The gateway answers a non-member with a GraphQL error whose
 * `extensions.code` is NOT_A_MEMBER; the backend answers REST with
 * 403 { code: 'NOT_A_MEMBER' }. Either way the app shows one calm page —
 * never a crash, and never a login loop (a non-member IS signed in; sending
 * them to the login page would bring them straight back).
 *
 * A tiny store so a REST call deep in an upload can flip the whole app to
 * that page without threading a callback through every component.
 */
export const NOT_A_MEMBER = 'NOT_A_MEMBER';

let notMember = false;
const listeners = new Set();

export function reportNotMember() {
  if (notMember) return;
  notMember = true;
  listeners.forEach((fn) => fn(true));
}

export function isNotMemberState() {
  return notMember;
}

export function onNotMember(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test/sign-out reset. */
export function resetMembership() {
  notMember = false;
}

/** Whether an Apollo error (or a REST ApiError) is the member gate's answer. */
export function isNotMemberError(error) {
  if (!error) return false;
  if (error.code === NOT_A_MEMBER || error.body?.code === NOT_A_MEMBER || error.body?.error?.code === NOT_A_MEMBER) return true;
  const gql = error.graphQLErrors ?? error.errors ?? [];
  if (gql.some((e) => e?.extensions?.code === NOT_A_MEMBER || e?.code === NOT_A_MEMBER)) return true;
  const net = error.networkError?.result?.errors ?? [];
  return net.some((e) => e?.extensions?.code === NOT_A_MEMBER);
}
