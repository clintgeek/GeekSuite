import { createApolloClient } from '@geeksuite/api-client';

/**
 * The Apollo client for bujogeek.
 *
 * ─── The cache rule (SUITE_TODO #26) ──────────────────────────────────────
 *
 * **Every mutation owns the cache consequences of its own write.** Not the
 * page that fired it, not the next component to mount. Four clauses, applied
 * in order — the first one that covers a change is the one to use:
 *
 * 1. **Field changes need nothing.** Every task/collection/habit mutation
 *    selects the entity's full field set (`TASK_FAMILY` and friends in
 *    `graphql/queries.js`), so `InMemoryCache` merges the result into
 *    `Task:<id>` by itself and every cached list holding that entity redraws.
 *    Adding a field to a query means adding it to the mutations that can
 *    change it — that is the whole maintenance burden of this clause.
 *
 * 2. **Membership changes need `cache.modify`.** A create or a delete changes
 *    which ids a list contains, and no amount of field merging can infer
 *    that. Those go through `update(cache, result)` in `graphql/cacheUpdates.js`,
 *    which rewrites the affected root field's array. Deletes also
 *    `cache.evict` the entity and `gc()`, so a dangling reference cannot
 *    outlive the row.
 *
 * 3. **Server-derived values get evicted, not refetched.** A collection's
 *    `taskCount`, the tag index — these are computed by the gateway from data
 *    the client just changed, and the client cannot recompute them honestly.
 *    Evicting the *field* (not the document) marks it missing, and the
 *    `cache-and-network` queries that read it fetch just that, on their own
 *    schedule. This is the clause that replaced the blanket `await refetch()`
 *    the collection and habit hooks used to run after every write.
 *
 * 4. **`refetchQueries` is the last resort**, for a shape the client genuinely
 *    cannot predict. There is currently one place that needs it, and it is
 *    commented where it sits.
 *
 * On top of those: **`optimisticResponse` for complete/uncomplete.** Ticking a
 * checkbox is the app's most-repeated gesture and must never wait on a round
 * trip. The optimistic object is a full `updateTaskStatus` payload so clause 1
 * applies to it too, and Apollo rolls the whole layer back on error.
 *
 * ─── The one documented exception ─────────────────────────────────────────
 *
 * The task LOG views — `dailyTasks` / `weeklyTasks` / `monthlyTasks` /
 * `allTasks` / `blockedTasks` — are fetched `no-cache` and mirrored into React
 * state by `context/TaskContext.jsx`. They expand recurring occurrences into
 * synthetic `virtual_<master>_<epoch>` rows that are not stable entities, so
 * normalising them would put ids in the cache that no mutation can address.
 * TaskContext therefore patches its own array, and additionally runs the
 * `update` functions above so that everything the cache DOES own — the
 * collections, their counts, the tag index — stays honest. Unifying the two is
 * its own piece of work; see `DOCS/CONTEXT.md` under Known Issues.
 *
 * The client itself is the suite-standard one (auth link, 401 → logout,
 * `InMemoryCache`); bujogeek adds no type policies, because every rule above
 * is expressed at the mutation that causes the change rather than in a policy
 * far away from it.
 */
export const apolloClient = createApolloClient('bujogeek');
