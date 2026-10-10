/**
 * Apollo cache policies for NewsGeek.
 *
 * `newsArticles` is one list per filter (section / place / source). The
 * first page (no `before`) replaces it — a refetch is a fresh front page —
 * and an "Older stories" page (`before` set) appends, deduped by article.
 *
 * "Free to read" is the reader's server-side pref, NOT an argument: the
 * gateway answers the same variables differently with the switch on or off.
 * So a list cached under one setting must never be merged with (or served
 * as) the other. Flipping the switch therefore drops EVERY cached article
 * list (`resetArticleLists`) once the gateway has stored the new setting,
 * and the visible list is refetched. (A mode-in-keyArgs scheme was tried and
 * rejected: Apollo memoizes reads by field, not by a key function's hidden
 * input, and served the old list after the write.)
 */
export const NEWS_TYPE_POLICIES = {
  Query: {
    fields: {
      newsArticles: {
        keyArgs: ['section', 'placeId', 'sourceId'],
        merge(existing, incoming, { args, readField }) {
          if (!args?.before || !existing) return incoming;
          const seen = new Set(existing.items.map((ref) => readField('id', ref)));
          const fresh = incoming.items.filter((ref) => !seen.has(readField('id', ref)));
          return { ...incoming, items: [...existing.items, ...fresh] };
        },
      },
    },
  },
};

/**
 * Forget every cached `newsArticles` list (all filters, all pages) without
 * telling watchers — the caller refetches what is on screen, so nothing
 * flashes empty and no query fires twice.
 */
export function resetArticleLists(cache) {
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'newsArticles', broadcast: false });
  cache.gc();
}

export function installNewsPolicies(client) {
  client.cache.policies.addTypePolicies(NEWS_TYPE_POLICIES);
}
