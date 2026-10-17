/**
 * exportGamesCsv — the games the library's current filter matches, as a CSV.
 *
 * Same contract as BookGeek's export (apps/bookgeek/web/src/utils/
 * exportBooksCsv.js), which this follows on purpose:
 *
 *   - "What's on screen" means what the FILTER matches, not the rows loaded so
 *     far. The library pages 48 at a time, so the caller walks every page of
 *     the same query, filter and sort (exportLibraryCsv below), and this
 *     module only formats what it is given.
 *   - Every cell is escaped per RFC 4180 and defused against spreadsheet
 *     formula injection: much of the library came from Playnite and metadata
 *     providers, so the text isn't all self-authored.
 *   - The Blob carries a UTF-8 BOM so Excel doesn't turn accented titles into
 *     mojibake. CRLF line endings.
 *
 * The CSV core (csvValue / csvField) is a copy of BookGeek's rather than a
 * shared package: a change to a shared package reaches every app, and this is
 * twenty lines. Hours played are deliberately not a column (Chef doesn't
 * track playtime).
 */
import { GET_GAMES_EXPORT } from '../graphql/queries';
import { formatLabel, platformLabel, shelfLabel, storefrontLabel } from './vocab';

const FORMULA_LEADERS = ['=', '+', '-', '@', '\t', '\r'];

/** Excel needs this to read the file as UTF-8. */
export const UTF8_BOM = '﻿';

/** The gateway caps a page at 100 (resolvers: pageArgs maxLimit). */
export const EXPORT_PAGE_SIZE = 100;

export const GAME_CSV_COLUMNS = [
  { key: 'title', label: 'Title' },
  { key: 'releaseYear', label: 'Year' },
  { key: 'releaseDate', label: 'Release date' },
  { key: 'developers', label: 'Developers' },
  { key: 'publishers', label: 'Publishers' },
  { key: 'seriesName', label: 'Series' },
  { key: 'seriesIndex', label: 'Series #' },
  { key: 'genres', label: 'Genres' },
  { key: 'tags', label: 'Tags' },
  { key: 'platforms', label: 'Copies' },
  { key: 'owned', label: 'Owned' },
  { key: 'shelf', label: 'Shelf' },
  { key: 'rating', label: 'Rating' },
  { key: 'favorite', label: 'Favorite' },
  { key: 'lastPlayed', label: 'Last played' },
  { key: 'timeToBeat', label: 'Time to beat (main, h)' },
  { key: 'dateAdded', label: 'Date added' },
  { key: 'id', label: 'GameGeek ID' },
];

/** One value, rendered for a cell, before quoting. `false` survives. */
export function csvValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined && v !== '').join('; ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** One cell, escaped per RFC 4180 and defused for spreadsheets. */
export function csvField(value) {
  let text = csvValue(value);
  if (text.length > 0 && FORMULA_LEADERS.includes(text[0])) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** YYYY-MM-DD, the local calendar day of a stored instant; '' when absent. */
export function localDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Switch · Physical", "PC · Steam": one per copy. */
function copyLabel(copy) {
  const where = copy?.storefront ? storefrontLabel(copy.storefront) : copy?.format ? formatLabel(copy.format) : '';
  const platform = copy?.platform ? platformLabel(copy.platform) : '';
  return [platform, where].filter(Boolean).join(' · ');
}

/** Flatten a game into the shape GAME_CSV_COLUMNS reads. */
export function gameToRow(game = {}, { customShelves = [] } = {}) {
  const me = game?.me || {};
  const tags = [...(game?.tags || []), ...(game?.autoTags || [])];
  return {
    id: game?.id,
    title: game?.title,
    releaseYear: game?.releaseYear,
    releaseDate: game?.releaseDate ? String(game.releaseDate).slice(0, 10) : '',
    developers: game?.developers || [],
    publishers: game?.publishers || [],
    seriesName: game?.series?.name ?? '',
    seriesIndex: game?.series?.index ?? '',
    genres: game?.genres || [],
    tags: [...new Set(tags)],
    platforms: (game?.copies || []).map(copyLabel).filter(Boolean),
    owned: typeof game?.owned === 'boolean' ? game.owned : null,
    shelf: me.shelf ? shelfLabel(me.shelf, customShelves) : '',
    rating: typeof me.rating === 'number' && me.rating > 0 ? me.rating : '',
    favorite: typeof me.favorite === 'boolean' ? me.favorite : null,
    lastPlayed: localDay(me.lastPlayedAt),
    timeToBeat: typeof game?.timeToBeat?.main === 'number' ? game.timeToBeat.main : '',
    dateAdded: localDay(game?.createdAt),
  };
}

/** The whole file, as a string (no BOM: that belongs to the Blob). */
export function buildGamesCsv(games, { columns = GAME_CSV_COLUMNS, customShelves = [] } = {}) {
  const list = Array.isArray(games) ? games : [];
  const header = columns.map((c) => csvField(c.label)).join(',');
  const rows = list.map((game) => {
    const row = gameToRow(game, { customShelves });
    return columns.map((c) => csvField(row[c.key])).join(',');
  });
  // A header with no rows still says the export ran and matched nothing.
  return [header, ...rows].join('\r\n');
}

/**
 * A filename that says what's inside, so two exports don't overwrite each
 * other or blur together. `filter` is the library's GameFilterInput.
 */
export function gamesCsvFilename(filter = {}, now = new Date()) {
  const parts = ['gamegeek'];
  const shelves = filter?.shelves || [];
  if (shelves.length === 1) parts.push(shelves[0]);
  if (filter?.genres?.length === 1) parts.push(filter.genres[0]);
  if (filter?.tags?.length === 1) parts.push(`tag-${filter.tags[0]}`);
  if (filter?.platforms?.length === 1) parts.push(filter.platforms[0]);
  if (filter?.q) parts.push(`search-${filter.q}`);
  const slug = parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${slug}-${localDay(now)}.csv`;
}

/**
 * Every game the current filter and sort match, walking the pages.
 * `variables` are the library's own GetGames variables (buildGamesVariables).
 * Bounded so a bad `total` can't spin forever: 200 × 100 is far past any
 * real library, and failing loudly beats hanging the tab.
 */
export async function fetchAllMatchingGames(client, variables = {}) {
  const { page: _page, limit: _limit, ...rest } = variables;
  const collected = [];
  for (let page = 1; page <= 200; page += 1) {
    const res = await client.query({
      query: GET_GAMES_EXPORT,
      variables: { ...rest, page, limit: EXPORT_PAGE_SIZE },
      fetchPolicy: 'no-cache',
    });
    const payload = res?.data?.games || {};
    const items = Array.isArray(payload.games) ? payload.games : [];
    collected.push(...items);
    const total = typeof payload.total === 'number' ? payload.total : collected.length;
    const pages = typeof payload.pages === 'number' ? payload.pages : null;
    if (items.length === 0 || collected.length >= total || (pages !== null && page >= pages)) break;
  }
  return collected;
}

/** Fetch, format and hand the browser a file. Returns how many games. */
export async function exportLibraryCsv(client, variables, { customShelves = [], now = new Date() } = {}) {
  const games = await fetchAllMatchingGames(client, variables);
  const csv = buildGamesCsv(games, { customShelves });
  const blob = new Blob([UTF8_BOM, csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = gamesCsvFilename(variables?.filter, now);
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Give the click a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return games.length;
}
