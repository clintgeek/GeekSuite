/**
 * The Apollo side of a paginated collection list: ONE cached list per
 * filter + sort, pages merged into it, refreshed in place, never collapsed.
 *
 *   Query: { fields: { games: pagedListPolicy({ keyArgs: [...], itemsField: 'games' }) } }
 *
 *   - `keyArgs` leave out `page` and `limit`, so every page of one filter +
 *     sort lands in the same list.
 *   - page 1 is a refresh: its rows replace the head of the list, and any
 *     rows already loaded beyond it stay (so nothing collapses);
 *   - a later page appends the rows the list does not have yet.
 *   Either way a row is in the list once. Appending (rather than writing at a
 *   fixed offset) is what keeps paging honest after a delete or a create has
 *   shifted the server's pages under the loaded list.
 *
 * Edits should update the row entity in place (a mutation that returns it);
 * a create calls `refreshPagedList` (one page-1 request as long as what is
 * loaded); a delete calls `removeFromPagedLists`. Note `refetch()` /
 * `refetchQueries` will not do: Apollo writes a refetch with `overwrite`, so
 * the merge sees no existing list and three loaded pages collapse to one —
 * GameGeek's scroll-to-top bug of 2026-09-25.
 */

/** The merge function for a list whose page object keeps its rows in `itemsField`. */
export function mergePagedList(itemsField = 'items') {
  return function merge(existing, incoming, { args }) {
    if (!incoming) return existing;
    const keyOf = (ref) => ref?.__ref ?? ref?.id;
    const old = existing?.[itemsField] ?? [];
    const fresh = incoming[itemsField] ?? [];
    const page = args?.page ?? 1;
    const ordered = page <= 1 ? [...fresh, ...old.slice(fresh.length)] : [...old, ...fresh];
    const seen = new Set();
    const items = ordered.filter((ref) => {
      const key = keyOf(ref);
      if (!ref || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { ...incoming, [itemsField]: items };
  };
}

/** A field policy for a paginated list: `{ keyArgs, merge }`. */
export function pagedListPolicy({ keyArgs, itemsField = 'items' }) {
  return { keyArgs, merge: mergePagedList(itemsField) };
}

/**
 * Bring a cached list up to date WITHOUT collapsing it: one request for
 * page 1 with `limit` = everything already loaded (at least `pageSize`),
 * merged over the cached list at offset 0. The reader keeps every row they
 * had and their scroll position; a new row shows up where it sorts.
 * `variables` are the list's page-1 variables.
 */
export async function refreshPagedList(client, { query, variables, field, itemsField = 'items', pageSize = 48 }) {
  let loaded = 0;
  try {
    loaded = client.readQuery({ query, variables })?.[field]?.[itemsField]?.length ?? 0;
  } catch {
    loaded = 0;
  }
  await client.query({
    query,
    variables: { ...variables, limit: Math.max(pageSize, loaded) },
    fetchPolicy: 'network-only',
  });
}

/**
 * Take one row out of every cached list of root field `field` (and its
 * `total`) — a delete, with no refetch — then evict the row entity
 * (`typename` + `id`).
 */
export function removeFromPagedLists(cache, { field, itemsField = 'items', typename, id }) {
  cache.modify({
    id: 'ROOT_QUERY',
    fields: {
      [field](existing, { readField }) {
        if (!existing?.[itemsField]) return existing;
        const items = existing[itemsField].filter((ref) => readField('id', ref) !== id);
        if (items.length === existing[itemsField].length) return existing;
        return { ...existing, [itemsField]: items, total: Math.max(0, (existing.total ?? 1) - 1) };
      },
    },
  });
  if (typename) cache.evict({ id: cache.identify({ __typename: typename, id }) });
  cache.gc();
}

/**
 * After a bulk change (an import, a metadata run) the cached lists and counts
 * are stale in ways a page-1 refresh cannot fix. Drop these root fields; the
 * list reloads fresh the next time it shows.
 */
export function evictRootFields(client, fieldNames) {
  const cache = client?.cache;
  if (!cache) return;
  for (const fieldName of fieldNames) cache.evict({ id: 'ROOT_QUERY', fieldName });
  cache.gc();
}

/**
 * Add type policies to a client's cache once (`GeekSuiteApolloProvider`
 * builds a plain InMemoryCache the app cannot configure up front) — before
 * the first query writes anything.
 */
const installedPolicies = new WeakMap();

export function installTypePoliciesOnce(client, policies) {
  const cache = client?.cache;
  if (!cache?.policies) return;
  let seen = installedPolicies.get(cache);
  if (!seen) {
    seen = new WeakSet();
    installedPolicies.set(cache, seen);
  }
  if (seen.has(policies)) return;
  cache.policies.addTypePolicies(policies);
  seen.add(policies);
}
