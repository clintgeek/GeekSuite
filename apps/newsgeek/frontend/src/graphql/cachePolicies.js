/**
 * Apollo cache policies for NewsGeek.
 *
 * `newsArticles` is one list per filter (section / place / source). The
 * first page (no `before`) replaces it — a refetch is a fresh front page —
 * and an "Older stories" page (`before` set) appends, deduped by article.
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

export function installNewsPolicies(client) {
  client.cache.policies.addTypePolicies(NEWS_TYPE_POLICIES);
}
