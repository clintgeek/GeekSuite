import { GET_LABEL_THING } from '../graphql/labelQueries';

/**
 * Look up every id on a `/labels?ids=...` request, one `thing(id)` query per
 * id (there is no `ids` filter on `ThingFilterInput` to batch this — see
 * DOCS/GRAPHQL.md). `thing(id)` answers `null` for a bad, missing, deleted
 * or someone-else's-household id rather than throwing; a genuine network or
 * server error is folded into the same "missing" bucket so one bad id (or a
 * flaky request) never crashes the whole page — the page's job is a friendly
 * note, not a stack trace.
 *
 * Returns `{ found, missingIds }`, `found` in the same order as `ids`.
 */
export async function fetchLabelThings(client, ids) {
  const results = await Promise.all(
    ids.map((id) =>
      client
        .query({ query: GET_LABEL_THING, variables: { id }, fetchPolicy: 'no-cache' })
        .then(({ data }) => data?.thing ?? null)
        .catch(() => null)
    )
  );
  const found = [];
  const missingIds = [];
  ids.forEach((id, i) => {
    if (results[i]) found.push(results[i]);
    else missingIds.push(id);
  });
  return { found, missingIds };
}
