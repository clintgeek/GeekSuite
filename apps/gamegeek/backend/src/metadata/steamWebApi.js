/**
 * Steam Web API calls that need `STEAM_API_KEY` (unlike the store search/
 * appdetails in steamClient.js, which are keyless): resolving a vanity name
 * to a SteamID64, and listing owned games for the import
 * (DOCS/GameGeekPlan.md §7). Never printed or logged — key names only, per
 * this repo's secret-handling rule.
 */
const OUTBOUND_TIMEOUT_MS = 10000;

export function isSteamImportConfigured(env = process.env) {
  return Boolean(env.STEAM_API_KEY);
}

export async function resolveVanityUrl(vanityName, options = {}) {
  const { fetchImpl = fetch, env = process.env } = options;
  const url = new URL('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/');
  url.searchParams.set('key', env.STEAM_API_KEY);
  url.searchParams.set('vanityurl', vanityName);
  url.searchParams.set('format', 'json');

  const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Steam ResolveVanityURL failed: ${res.status}`);
  const data = await res.json();
  if (data?.response?.success !== 1 || !data?.response?.steamid) return null;
  return String(data.response.steamid);
}

/**
 * @returns {Promise<{ games: object[] } | null>} null distinguishes "Steam
 *   answered with no `games` key at all" (a private profile) from a
 *   genuinely empty library, which callers must tell apart
 *   (DOCS/GameGeekPlan.md §7 / §12).
 */
export async function getOwnedGames(steamId64, options = {}) {
  const { fetchImpl = fetch, env = process.env } = options;
  const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/');
  url.searchParams.set('key', env.STEAM_API_KEY);
  url.searchParams.set('steamid', steamId64);
  url.searchParams.set('include_appinfo', '1');
  url.searchParams.set('include_played_free_games', '1');
  url.searchParams.set('format', 'json');

  const res = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Steam GetOwnedGames failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.response?.games)) return null;
  return { games: data.response.games };
}

export default { isSteamImportConfigured, resolveVanityUrl, getOwnedGames };
