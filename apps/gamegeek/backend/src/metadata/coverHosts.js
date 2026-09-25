/**
 * The only hosts GameGeek's cover pipeline (upload-by-URL, Steam import
 * background covers) is allowed to reach. Exact hostnames, not suffixes —
 * see src/lib/coverFetch.js for why that distinction matters.
 *
 * DOCS/GameGeekPlan.md §4.3.
 */
export const COVER_HOSTS = [
  'images.igdb.com',
  'shared.akamai.steamstatic.com',
  'cdn.akamai.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'cdn.cloudflare.steamstatic.com',
  'media.rawg.io',
];

export default COVER_HOSTS;
