/**
 * Parse whatever a caller typed into the Steam-import "steamId" field: a
 * bare SteamID64, a vanity name, or a full profile URL of either kind. Pure
 * — no network. The vanity form still needs `ResolveVanityURL` to become a
 * SteamID64 (see steamWebApi.js); this only classifies the input.
 */

const ID64_RE = /^\d{17}$/;
const VANITY_RE = /^[A-Za-z0-9_-]{2,64}$/;

/**
 * @param {string} raw
 * @returns {{ type: 'id64'|'vanity', value: string } | null} null when the
 *   input is empty or doesn't look like anything Steam would recognize.
 */
export function parseSteamIdInput(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  let m = s.match(/steamcommunity\.com\/profiles\/(\d{17})\/?/i);
  if (m) return { type: 'id64', value: m[1] };

  m = s.match(/steamcommunity\.com\/id\/([^/\s?#]+)\/?/i);
  if (m) return { type: 'vanity', value: m[1] };

  if (ID64_RE.test(s)) return { type: 'id64', value: s };
  if (VANITY_RE.test(s)) return { type: 'vanity', value: s };

  return null;
}

export default { parseSteamIdInput };
