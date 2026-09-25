/**
 * Pure normalizers for RAWG (api.rawg.io) → MetadataCandidate, the same
 * shape igdb.js and steam.js produce. No network here — see rawgClient.js.
 * Tested against fixture JSON under test/fixtures/, never live.
 *
 * RAWG's only image is `background_image`, a LANDSCAPE screenshot-style
 * banner. It is still a usable cover, but the enrichment order puts Steam's
 * portrait and IGDB's cover ahead of it (apps/gamegeek/DOCS/METADATA_ENRICHMENT.md).
 */
import { mapNames, RAWG_PLATFORM_MAP, RAWG_MODE_TAG_MAP } from './platformMap.js';
import { toPlainText } from '../enrichment/text.js';

/** RAWG `released` is "YYYY-MM-DD" (sometimes null) → ISO UTC midnight, or null. */
export function parseRawgDate(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const names = (list, pick = (x) => x?.name) => (Array.isArray(list) ? list.map(pick).filter(Boolean) : []);

/**
 * One element of `/games?search=` `results`, or the `/games/{id}` body.
 * The detail body adds description/developers/publishers/tags; a search
 * result simply leaves those empty.
 */
export function normalizeRawgGame(game) {
  const id = String(game?.id ?? '');
  const platformNames = names(game?.platforms, (p) => p?.platform?.name);
  const tagSlugs = names(game?.tags, (t) => t?.slug);
  const cover = typeof game?.background_image === 'string' && game.background_image ? game.background_image : null;
  const description = game?.description_raw || game?.description || '';

  return {
    provider: 'rawg',
    providerId: id,
    title: game?.name || '',
    releaseDate: game?.tba ? null : parseRawgDate(game?.released),
    developers: names(game?.developers),
    publishers: names(game?.publishers),
    genres: names(game?.genres),
    description: toPlainText(description),
    platforms: mapNames(platformNames, RAWG_PLATFORM_MAP),
    modes: mapNames(tagSlugs, RAWG_MODE_TAG_MAP),
    coverUrl: cover,
    coverUrls: cover ? [cover] : [],
    coverIsLandscape: true,
    externalIds: { rawg: id },
  };
}

/** @param {{results?: object[]}} response the `/games?search=` body. */
export function normalizeRawgSearchResults(response) {
  const results = Array.isArray(response?.results) ? response.results : [];
  return results.filter((g) => g && g.id != null).map(normalizeRawgGame);
}

export default { parseRawgDate, normalizeRawgGame, normalizeRawgSearchResults };
