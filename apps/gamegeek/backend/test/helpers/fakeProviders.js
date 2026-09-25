/**
 * Fake enrichment providers with the same interface as
 * src/enrichment/providers.js. Each records the calls it received.
 */
export function fakeProvider({ step, name, configured = true, idFor, search = {}, details = {}, throws = null }) {
  const calls = { search: [], detail: [] };
  const p = {
    step,
    name,
    calls,
    configured,
    isConfigured: () => p.configured,
    appliesTo: (game) => (idFor ? Boolean(idFor(game)) : true),
    async detail(id) {
      calls.detail.push(id);
      if (throws) throw throws;
      return details[id] ?? null;
    },
  };
  if (idFor) p.idFor = idFor;
  else {
    p.search = async (title) => {
      calls.search.push(title);
      if (throws) throw throws;
      return (typeof search === 'function' ? search(title) : search[title]) ?? [];
    };
  }
  return p;
}

/** The four steps in spec order; pass overrides per step. */
export function fakeProviderSet({ steamAppDetails = {}, igdb = {}, rawg = {}, steamSearch = {} } = {}) {
  const sa = fakeProvider({
    step: 'steam-appdetails',
    name: 'steam',
    idFor: (g) => g?.externalIds?.steamAppId || null,
    ...steamAppDetails,
  });
  const ig = fakeProvider({ step: 'igdb', name: 'igdb', configured: false, ...igdb });
  const rw = fakeProvider({ step: 'rawg', name: 'rawg', configured: false, ...rawg });
  const ss = fakeProvider({ step: 'steam-search', name: 'steam', ...steamSearch });
  return {
    steps: { steamAppDetails: sa, igdb: ig, rawg: rw, steamSearch: ss },
    ordered: [sa, ig, rw, ss],
    searchable: [ig, rw, ss],
    byName: { steam: ss, igdb: ig, rawg: rw },
    configured: () => ({ steam: true, igdb: ig.configured, rawg: rw.configured }),
  };
}

/** A full candidate as a provider's detail() would return it. */
export function detailOf(provider, providerId, title, extra = {}) {
  return {
    provider,
    providerId: String(providerId),
    title,
    releaseDate: null,
    developers: ['Dev Co'],
    publishers: ['Pub Co'],
    genres: ['Action'],
    description: `About ${title}.`,
    platforms: ['pc'],
    modes: ['single'],
    coverUrls: [`https://images.igdb.com/${providerId}.jpg`],
    externalIds: provider === 'steam' ? { steamAppId: String(providerId) } : { [provider]: String(providerId) },
    ...extra,
  };
}

export const searchHit = (provider, providerId, title, releaseDate = null) => ({ provider, providerId: String(providerId), title, releaseDate });

/**
 * A fake `providers.tags` (src/enrichment/providers.js) backed by tables:
 *   igdb: { <igdb id>: terms[] }   steam: { <steam uid>: <igdb id> }
 *   rawg: { <rawg id>: terms[] }   search: { <title>: candidates[] }
 * `throws: { igdb?, steam?, rawg?, search? }` makes that source fail.
 */
export function fakeTagSource({ igdb = {}, steam = {}, rawg = {}, search = {}, igdbOn = true, rawgOn = true, throws = {} } = {}) {
  const calls = { igdbTagsByIds: [], igdbIdsBySteam: [], rawgTags: [], igdbSearch: [] };
  return {
    calls,
    igdbConfigured: () => igdbOn,
    rawgConfigured: () => rawgOn,
    async igdbTagsByIds(ids) {
      calls.igdbTagsByIds.push([...ids]);
      if (throws.igdb) throw throws.igdb;
      return new Map(ids.filter((id) => igdb[id]).map((id) => [String(id), igdb[id]]));
    },
    async igdbIdsBySteam(uids) {
      calls.igdbIdsBySteam.push([...uids]);
      if (throws.steam) throw throws.steam;
      return new Map(uids.filter((u) => steam[u]).map((u) => [String(u), String(steam[u])]));
    },
    async rawgTags(id) {
      calls.rawgTags.push(id);
      if (throws.rawg) throw throws.rawg;
      return rawg[id] ?? null;
    },
    async igdbSearch(title) {
      calls.igdbSearch.push(title);
      if (throws.search) throw throws.search;
      return search[title] ?? [];
    },
  };
}
