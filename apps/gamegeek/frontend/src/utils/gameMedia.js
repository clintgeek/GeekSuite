/**
 * The detail page's store links and media strip
 * (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md §Media and links).
 *
 * Links never wait on the media fetch: Steam and GOG come straight from the
 * game's ids, the two searches are always there, and IGDB/RAWG upgrade to
 * their real page once the backend has fetched its URL/slug (IGDB falls
 * back to a title search until then — its web URLs are slugs, not ids).
 */

const STEAM_ID = /^\d{1,12}$/;

const youtubeSearch = (title) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} trailer`)}`;
const steamSearch = (title) => `https://store.steampowered.com/search/?term=${encodeURIComponent(title)}`;

/** An https URL on one of `hosts`, or null — the server already checks; this is belt and braces. */
function httpsOn(url, hosts) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && hosts.includes(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * `[{kind, label, url}]` in a fixed order: Steam store, GOG, IGDB, RAWG,
 * Watch a trailer, and Search on Steam for a game Steam doesn't know yet.
 */
export function buildGameLinks(game, media) {
  if (!game) return [];
  const ids = game.externalIds || {};
  const title = (game.title || '').trim();
  const fromServer = Object.fromEntries((media?.links || []).map((l) => [l.kind, l.url]));
  const links = [];

  const steamId = STEAM_ID.test(String(ids.steamAppId ?? '')) ? String(ids.steamAppId) : null;
  if (steamId) links.push({ kind: 'steam', label: 'Steam store', url: `https://store.steampowered.com/app/${steamId}/` });
  if (ids.gog) links.push({ kind: 'gog', label: 'GOG', url: `https://www.gog.com/en/game/${encodeURIComponent(ids.gog)}` });

  if (ids.igdb) {
    const page = httpsOn(fromServer.igdb, ['www.igdb.com', 'igdb.com']);
    if (page) links.push({ kind: 'igdb', label: 'IGDB', url: page });
    else if (title) links.push({ kind: 'igdb', label: 'IGDB', url: `https://www.igdb.com/search?type=1&q=${encodeURIComponent(title)}` });
  }
  if (ids.rawg) {
    const page = httpsOn(fromServer.rawg, ['rawg.io']);
    if (page) links.push({ kind: 'rawg', label: 'RAWG', url: page });
  }

  if (title) {
    links.push({ kind: 'trailer-search', label: 'Watch a trailer', url: youtubeSearch(title) });
    if (!steamId) links.push({ kind: 'steam-search', label: 'Search on Steam', url: steamSearch(title) });
  }
  return links;
}

/**
 * One list for the strip and the viewer: the lead trailer first, then the
 * screenshots, then any other trailers. Each item carries its own alt text
 * ("Hades screenshot 3" — numbered among screenshots, not among all items).
 */
export function mediaItems(media, title = '') {
  const shots = Array.isArray(media?.screenshots) ? media.screenshots.filter((s) => s?.full || s?.thumb) : [];
  const videos = Array.isArray(media?.videos) ? media.videos.filter((v) => v?.thumb || v?.url) : [];
  const name = title || 'Game';
  const asVideo = (v) => ({ type: 'video', ...v, label: `${name} trailer: ${v.title || 'Trailer'}` });
  const asShot = (s, i) => ({ type: 'screenshot', ...s, thumb: s.thumb || s.full, full: s.full || s.thumb, label: `${name} screenshot ${i + 1}` });
  const [lead, ...rest] = videos;
  return [...(lead ? [asVideo(lead)] : []), ...shots.map(asShot), ...rest.map(asVideo)];
}

/** Can this browser play HLS in a plain <video>? (Safari, Chrome on Android, recent desktop Chrome.) */
export function canPlayHls() {
  if (typeof document === 'undefined') return false;
  try {
    return Boolean(document.createElement('video').canPlayType?.('application/vnd.apple.mpegurl'));
  } catch {
    return false;
  }
}

/** The inline source for a Steam trailer, or null when it must open on Steam instead. */
export function inlineVideoSource(item, hlsOk = canPlayHls()) {
  if (item?.type !== 'video' || item.kind !== 'steam') return null;
  if (item.mp4) return { src: item.mp4, type: 'video/mp4' };
  if (item.hls && hlsOk) return { src: item.hls, type: 'application/vnd.apple.mpegurl' };
  return null;
}
