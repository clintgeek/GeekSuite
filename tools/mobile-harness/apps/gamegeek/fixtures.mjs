// GameGeek fixtures. A believable household library — real titles, real
// title lengths (the two-line clamps and plate type-steps are the point), a
// mix of games WITH box art and without (the generated title plate is what a
// fresh import shows, so it has to be screenshot-honest), and every shelf in
// use so the strip and the sidebar counts are real.
import { json, svg, sessionRoutes, graphqlRoute } from '../../lib/net.mjs';

const T = (s) => `${s}T00:00:00.000Z`;

// [id, title, year, developer, shelf, rating, hours, progress, copies, cover, genres]
const ROWS = [
  ['g1', 'Hades', 2020, 'Supergiant Games', 'playing', 5, 41.5, 70, [['switch', 'physical', 'retail'], ['pc', 'digital', 'steam']], null, ['Roguelike', 'Action']],
  ['g2', 'The Legend of Zelda: Tears of the Kingdom', 2023, 'Nintendo EPD', 'playing', 0, 88, 55, [['switch', 'physical', 'retail']], '#2f5d3a', ['Adventure']],
  ['g3', 'Stardew Valley', 2016, 'ConcernedApe', 'finished', 5, 212, 100, [['pc', 'digital', 'steam'], ['switch', 'digital', 'nintendo']], null, ['Farming', 'Life sim']],
  ['g4', 'Celeste', 2018, 'Maddy Makes Games', 'finished', 4, 14, 100, [['pc', 'digital', 'gog']], '#7a2e57', ['Platformer']],
  ['g5', 'Disco Elysium — The Final Cut', 2021, 'ZA/UM', 'backlog', 0, 0, 0, [['pc', 'digital', 'epic']], null, ['RPG']],
  ['g6', 'Hollow Knight', 2017, 'Team Cherry', 'on-hold', 4, 23, 45, [['switch', 'digital', 'nintendo']], '#1d2a3f', ['Metroidvania']],
  ['g7', "Baldur's Gate 3", 2023, 'Larian Studios', 'backlog', 0, 3.5, 5, [['pc', 'digital', 'steam'], ['steam-deck', 'digital', 'steam']], '#5a2b1a', ['RPG']],
  ['g8', 'Mario Kart 8 Deluxe', 2017, 'Nintendo EPD', 'finished', 4, 60, 100, [['switch', 'physical', 'retail']], null, ['Racing']],
  ['g9', 'Outer Wilds', 2019, 'Mobius Digital', 'wishlist', 0, 0, 0, [], null, ['Exploration']],
  ['g10', 'It Takes Two', 2021, 'Hazelight Studios', 'abandoned', 2, 6, 20, [['ps5', 'digital', 'playstation']], null, ['Co-op', 'Platformer']],
  ['g11', 'Balatro', 2024, 'LocalThunk', 'playing', 5, 32, 0, [['steam-deck', 'digital', 'steam'], ['ios', 'digital', 'apple']], '#23305e', ['Roguelike', 'Cards']],
  ['g12', 'Super Metroid', 1994, 'Nintendo R&D1', 'backlog', 0, 0, 0, [['snes', 'physical', 'retail']], null, ['Metroidvania']],
  ['g13', 'Animal Crossing: New Horizons', 2020, 'Nintendo EPD', 'custom-couch-coop', 3, 140, 0, [['switch', 'physical', 'retail']], null, ['Life sim']],
  ['g14', 'Portal 2', 2011, 'Valve', 'finished', 5, 11, 100, [['pc', 'digital', 'steam']], null, ['Puzzle']],
  ['g15', 'Slay the Spire', 2019, 'Mega Crit', 'finished', 5, 96, 100, [['pc', 'digital', 'steam']], '#3b2a4f', ['Card & Board', 'Strategy']],
  ['g16', 'Vampire Survivors', 2022, 'poncle', 'playing', 4, 18.2, 0, [['pc', 'digital', 'steam'], ['xbox-series', 'subscription', 'xbox']], null, ['Action', 'Roguelike']],
  ['g17', 'Return of the Obra Dinn', 2018, 'Lucas Pope', 'backlog', 0, 0, 0, [['pc', 'digital', 'gog']], '#51483a', ['Adventure', 'Puzzle']],
  ['g18', 'Pentiment', 2022, 'Obsidian Entertainment', 'backlog', 0, 0, 0, [['xbox-series', 'subscription', 'xbox']], null, ['Adventure', 'RPG']],
  ['g19', 'Dead Cells', 2018, 'Motion Twin', 'on-hold', 3, 7, 30, [['pc', 'digital', 'steam'], ['switch', 'digital', 'nintendo']], null, ['Action', 'Platformer']],
  ['g20', 'Divinity: Original Sin 2', 2017, 'Larian Studios', 'backlog', 0, 12, 10, [['pc', 'digital', 'gog']], '#3a2c1c', ['RPG', 'Strategy']],
  ['g21', 'Inscryption', 2021, 'Daniel Mullins Games', 'finished', 5, 16, 100, [['pc', 'digital', 'steam']], null, ['Card & Board', 'Puzzle']],
  ['g22', 'Control', 2019, 'Remedy Entertainment', 'backlog', 0, 0, 0, [['pc', 'digital', 'epic']], null, ['Action', 'Shooter']],
  ['g23', 'Unpacking', 2021, 'Witch Beam', 'finished', 4, 4.5, 100, [['switch', 'digital', 'nintendo']], null, ['Puzzle', 'Simulation']],
  ['g24', 'Halo Infinite', 2021, '343 Industries', 'abandoned', 2, 9, 15, [['xbox-series', 'subscription', 'xbox']], null, ['Shooter']],
  ['g25', 'Civilization VI', 2016, 'Firaxis Games', 'on-hold', 4, 140, 0, [['pc', 'digital', 'epic']], null, ['Strategy', 'Turn-based Strategy']],
  ['g26', 'Chrono Trigger', 1995, 'Square', 'wishlist', 0, 0, 0, [], null, ['RPG']],
  ['g27', 'Overcooked! 2', 2018, 'Ghost Town Games', 'custom-couch-coop', 4, 22, 0, [['switch', 'physical', 'retail']], null, ['Simulation', 'Party']],
  ['g28', 'Tunic', 2022, 'Andrew Shouldice', 'backlog', 0, 1.5, 5, [['pc', 'digital', 'steam']], '#1f5c5a', ['Action', 'Adventure']],
];

// Tags (DOCS/TAGS_AND_FILTERS.md §A3): `tags` are the person's own and
// Playnite's categories, `autoTags` come from enrichment. The Tags facet is
// the union. [tags, autoTags, timeToBeat.main, modes]
const META = {
  g1: [['Couch night'], ['Roguelike', 'Mythology', 'Hand-drawn', 'Isometric', 'Difficult', 'Story Rich'], 22, ['single']],
  g2: [[], ['Open World', 'Exploration', 'Crafting', 'Fantasy', 'Physics', 'Third-person'], 59, ['single']],
  g3: [['Comfort'], ['Farming', 'Cozy', 'Relaxing', 'Pixel Art', 'Crafting', 'Top-down'], 53, ['single', 'coop-online', 'coop-local']],
  g4: [[], ['Difficult', 'Pixel Art', 'Emotional', '2D', 'Side-scroller'], 8, ['single']],
  g5: [[], ['Story Rich', 'Choices Matter', 'Detective', 'Isometric', 'Dark'], 23, ['single']],
  g6: [[], ['Metroidvania', 'Difficult', 'Hand-drawn', 'Atmospheric', '2D', 'Dark Fantasy'], 27, ['single']],
  g7: [['Couch night'], ['Choices Matter', 'Fantasy', 'Turn-Based', 'Tactics', 'Story Rich', 'Isometric'], 75, ['single', 'coop-online']],
  g8: [['Couch night'], ['Driving', 'Party', 'Cartoony', '3D'], 12, ['single', 'coop-local', 'pvp-online']],
  g9: [[], ['Exploration', 'Space', 'Mystery', 'Atmospheric', 'First-person'], 22, ['single']],
  g10: [['Couch night'], ['Platformer', 'Comedy', 'Emotional', 'Third-person'], 13, ['coop-local', 'coop-online']],
  g11: [[], ['Roguelike', 'Deckbuilder', 'Pixel Art', 'Relaxing'], 11, ['single']],
  g12: [['Retro night'], ['Metroidvania', 'Sci-fi', 'Retro', 'Pixel Art', 'Side-scroller'], 7, ['single']],
  g13: [['Comfort'], ['Cozy', 'Relaxing', 'Fishing', 'Crafting', 'Cartoony'], 60, ['single', 'coop-local', 'pvp-online']],
  g14: [[], ['Physics', 'Comedy', 'Sci-fi', 'First-person'], 8, ['single', 'coop-online']],
  g15: [[], ['Roguelike', 'Deckbuilder', 'Turn-Based', 'Difficult'], 12, ['single']],
  g16: [['Game Pass'], ['Roguelite', 'Bullet Hell', 'Pixel Art', 'Top-down', 'Idle'], 15, ['single']],
  g17: [[], ['Mystery', 'Detective', 'Pirates', 'Low-poly', 'First-person'], 9, ['single']],
  g18: [['Game Pass'], ['Story Rich', 'Historical', 'Choices Matter', 'Hand-drawn', 'Mystery'], 16, ['single']],
  g19: [[], ['Roguelite', 'Metroidvania', 'Pixel Art', 'Difficult', 'Side-scroller'], 17, ['single']],
  g20: [[], ['Turn-Based', 'Tactics', 'Fantasy', 'Choices Matter', 'Isometric'], 60, ['single', 'coop-online', 'coop-local']],
  g21: [[], ['Deckbuilder', 'Psychological Horror', 'Mystery', 'Atmospheric'], 12, ['single']],
  g22: [[], ['Atmospheric', 'Sci-fi', 'Third-person', 'Mystery'], 12, ['single']],
  g23: [['Comfort'], ['Cozy', 'Relaxing', 'Emotional', 'Pixel Art'], 3, ['single']],
  g24: [['Game Pass'], ['Sci-fi', 'Military', 'First-person', 'Open World'], 11, ['single', 'coop-online', 'pvp-online']],
  g25: [[], ['4X', 'Turn-Based', 'Historical', 'Grand Strategy', 'Isometric'], null, ['single', 'pvp-online']],
  g26: [['Retro night'], ['Fantasy', 'Turn-Based', 'Retro', 'Pixel Art', 'Multiple Endings'], 23, ['single']],
  g27: [['Couch night'], ['Party', 'Cartoony', 'Management', 'Top-down'], 7, ['coop-local', 'coop-online']],
  g28: [[], ['Exploration', 'Soulslike', 'Isometric', 'Low-poly', 'Mystery'], null, ['single']],
};

// Metadata enrichment (DOCS/METADATA_ENRICHMENT.md) — a mix of every status
// so the provenance line and the ⋯ More rows exercise every branch. Games not
// listed here get `enrichment: null` (the worker hasn't reached them yet).
const ENRICHMENT = {
  g1: { status: 'matched', provider: 'steam', providerId: '1145360', matchedTitle: 'Hades', matchedAt: T('2026-09-24'), attempts: 1, error: null, manual: false },
  g2: { status: 'pending', provider: null, providerId: null, matchedTitle: null, matchedAt: null, attempts: 0, error: null, manual: false },
  g3: { status: 'matched', provider: 'igdb', providerId: '17000', matchedTitle: 'Stardew Valley', matchedAt: T('2026-09-20'), attempts: 1, error: null, manual: true },
  g4: { status: 'no-match', provider: null, providerId: null, matchedTitle: null, matchedAt: null, attempts: 2, error: null, manual: false },
  g5: { status: 'ambiguous', provider: null, providerId: null, matchedTitle: null, matchedAt: null, attempts: 1, error: null, manual: false },
  g6: { status: 'error', provider: null, providerId: null, matchedTitle: null, matchedAt: null, attempts: 3, error: 'Steam search timed out', manual: false },
  g7: { status: 'unlinked', provider: null, providerId: null, matchedTitle: null, matchedAt: null, attempts: 1, error: null, manual: false },
};

const sessionsFor = (id) =>
  id === 'g1'
    ? [
        { __typename: 'GameSession', id: 's1', playedOn: T('2026-09-23'), minutes: 90, platform: 'switch', note: 'Finally beat the Bone Hydra', createdAt: T('2026-09-23') },
        { __typename: 'GameSession', id: 's2', playedOn: T('2026-09-21'), minutes: 45, platform: 'pc', note: '', createdAt: T('2026-09-21') },
        { __typename: 'GameSession', id: 's3', playedOn: T('2026-09-18'), minutes: 120, platform: 'switch', note: 'Heat 8 run', createdAt: T('2026-09-18') },
      ]
    : [];

const playthroughsFor = (id) =>
  id === 'g1'
    ? [
        { __typename: 'GamePlaythrough', id: 'p1', startedAt: T('2024-01-04'), finishedAt: T('2024-02-11'), hours: 28, platform: 'switch', difficulty: 'God Mode', completion: 'story', notes: '' },
        { __typename: 'GamePlaythrough', id: 'p2', startedAt: T('2026-08-30'), finishedAt: null, hours: 13.5, platform: 'switch', difficulty: 'Heat 8', completion: null, notes: '' },
      ]
    : [];

export const GAMES = ROWS.map(([id, title, year, dev, shelf, rating, hours, progress, copies, cover, genres], i) => ({
  __typename: 'Game',
  id,
  title,
  sortTitle: title.toLowerCase().replace(/^the /, ''),
  releaseYear: year,
  releaseDate: T(`${year}-06-15`),
  developers: [dev],
  publishers: id === 'g1' ? ['Supergiant Games'] : [],
  coverUrl: cover ? `/api/games/${id}/cover?v=1` : null,
  coverColor: cover,
  owned: copies.length > 0,
  platformsAvailable: [...new Set(copies.map((c) => c[0]))],
  updatedAt: T('2026-09-20'),
  createdAt: T(`2026-0${(i % 9) + 1}-1${i % 10}`),
  copies: copies.map(([platform, format, storefront], j) => ({
    __typename: 'GameCopy',
    id: `${id}-c${j}`,
    platform,
    format,
    storefront,
    acquiredAt: null,
    notes: null,
    // g1's PC copy came in from Playnite — the one copy in the fixtures that
    // shows the badge and per-copy hours in the Copies section.
    fromPlaynite: id === 'g1' && platform === 'pc',
    playtimeHours: id === 'g1' && platform === 'pc' ? 41.5 : null,
  })),
  parentId: null,
  series: null,
  description:
    id === 'g1'
      ? 'Defy the god of the dead as you hack and slash out of the Underworld in this rogue-like dungeon crawler from the creators of Bastion, Transistor and Pyre.\n\nEach escape attempt is different, and every death sends you home a little stronger.'
      : '',
  genres,
  tags: META[id]?.[0] ?? [],
  autoTags: META[id]?.[1] ?? [],
  modes: META[id]?.[3] ?? ['single'],
  maxLocalPlayers: id === 'g8' ? 4 : null,
  timeToBeat:
    id === 'g1'
      ? { __typename: 'GameTimeToBeat', main: 22, extra: 48, complete: 95 }
      : META[id]?.[2]
        ? { __typename: 'GameTimeToBeat', main: META[id][2], extra: null, complete: null }
        : null,
  externalIds: id === 'g1' ? { __typename: 'GameExternalIds', igdb: '113112', steamAppId: '1145360', rawg: null, gog: null, epic: null } : null,
  enrichment: ENRICHMENT[id] ? { __typename: 'GameEnrichment', ...ENRICHMENT[id] } : null,
  source: 'igdb',
  me: shelf
    ? {
        __typename: 'GameMyState',
        shelf,
        rating: rating || null,
        review: id === 'g1' ? 'The best combat loop Supergiant has made. Zagreus is a delight.' : '',
        notes: '',
        progress,
        hoursPlayed: hours,
        hoursSource: id === 'g1' ? 'playnite' : id === 'g7' || id === 'g14' ? 'steam' : 'manual',
        favorite: id === 'g1' || id === 'g3',
        lastPlayedAt: shelf === 'playing' ? T('2026-09-23') : hours > 0 ? T(`2026-0${(i % 6) + 1}-02`) : null,
        playthroughs: playthroughsFor(id),
        sessions: sessionsFor(id),
      }
    : null,
  household:
    id === 'g1' || id === 'g8'
      ? [{ __typename: 'GameHouseholdEntry', userId: 'u2', displayName: 'Jess', shelf: id === 'g1' ? 'abandoned' : 'finished', rating: id === 'g1' ? 2 : 5, hoursPlayed: id === 'g1' ? 4 : 71 }]
      : [],
}));

const count = (shelf) => GAMES.filter((g) => g.me?.shelf === shelf).length;

export const SHELF_STATS = {
  __typename: 'GameShelfStats',
  total: GAMES.length,
  owned: GAMES.filter((g) => g.owned).length,
  unshelved: 0,
  shelves: ['playing', 'backlog', 'finished', 'on-hold', 'abandoned', 'wishlist', 'custom-couch-coop'].map((shelf) => ({
    __typename: 'GameShelfCount', shelf, count: count(shelf),
  })),
  platforms: ['pc', 'steam-deck', 'switch', 'ps5', 'xbox-series', 'ios', 'snes'].map((p) => ({
    __typename: 'GameShelfCount', shelf: p, count: GAMES.filter((g) => g.copies.some((c) => c.platform === p)).length,
  })),
};

export const PROFILE = {
  __typename: 'GameProfile',
  customShelves: [{ __typename: 'GameCustomShelf', id: 'custom-couch-coop', label: 'Couch co-op' }],
  savedFilters: [
    { __typename: 'GameSavedFilter', id: 'v1', name: 'Short tonight', filter: { lengths: ['short'], played: 'never' }, sortBy: 'timeToBeat', sortDir: 'asc', searchQuery: null, shelfFilter: null, platformFilter: null, ownedFilter: null },
    { __typename: 'GameSavedFilter', id: 'v2', name: 'Couch co-op on Switch', filter: { platforms: ['switch'], modes: ['coop-local'] }, sortBy: 'title', sortDir: 'asc', searchQuery: null, shelfFilter: null, platformFilter: null, ownedFilter: null },
  ],
  platformsOwned: ['pc', 'steam-deck', 'switch', 'ps5', 'ios'],
  defaultPlatform: 'switch',
  playniteLastImportAt: T('2026-09-24'),
  playniteLastGeneratedAtUtc: '2026-09-24T16:21:03.000Z',
  playniteLastTotal: 931,
};

export const VOCAB = {
  __typename: 'GameVocabulary',
  shelves: ['backlog', 'playing', 'finished', 'on-hold', 'abandoned', 'wishlist'],
  platforms: ['pc', 'steam-deck', 'mac', 'linux', 'switch', 'switch-2', 'ps5', 'ps4', 'ps3', 'xbox-series', 'xbox-one', 'xbox-360', 'ios', 'android', 'cloud', 'arcade', 'nes', 'snes', 'n64', 'gamecube', 'wii', 'wii-u', 'game-boy', 'gba', 'ds', '3ds', 'genesis', 'ps1', 'ps2', 'psp', 'vita', 'atari-2600', 'retro-other'],
  storefronts: ['steam', 'gog', 'epic', 'amazon', 'luna', 'itch', 'ea', 'ubisoft', 'battle-net', 'xbox', 'microsoft', 'playstation', 'nintendo', 'apple', 'google-play', 'retail', 'other'],
  copyFormats: ['physical', 'digital', 'subscription'],
  modes: ['single', 'coop-local', 'coop-online', 'pvp-local', 'pvp-online'],
  completionLevels: ['story', 'extra', 'complete'],
};

const strip = ({ coverColor, ...g }) => g; // eslint-disable-line no-unused-vars

const ttb = (g) => g.timeToBeat?.main ?? null;
const SORTERS = {
  title: (a, b) => a.sortTitle.localeCompare(b.sortTitle),
  dateAdded: (a, b) => a.createdAt.localeCompare(b.createdAt),
  releaseDate: (a, b) => a.releaseDate.localeCompare(b.releaseDate),
  rating: (a, b) => (a.me?.rating || 0) - (b.me?.rating || 0),
  lastPlayed: (a, b) => String(a.me?.lastPlayedAt || '').localeCompare(String(b.me?.lastPlayedAt || '')),
  hoursPlayed: (a, b) => (a.me?.hoursPlayed || 0) - (b.me?.hoursPlayed || 0),
  timeToBeat: (a, b) => (ttb(a) ?? 1e9) - (ttb(b) ?? 1e9),
};

// A small stand-in for the gateway's filter (DOCS/TAGS_AND_FILTERS.md §B1),
// faithful enough that the counts beside every option are the counts the
// grid would really show.
const NOW = Date.parse('2026-09-25T12:00:00Z');
const lengthOf = (g) => {
  const h = ttb(g);
  if (h == null) return 'unknown';
  return h < 5 ? 'short' : h < 15 ? 'medium' : h < 40 ? 'long' : 'epic';
};
const playedOf = (g) => {
  const last = g.me?.lastPlayedAt ? Date.parse(g.me.lastPlayedAt) : null;
  const buckets = [];
  if (!(g.me?.hoursPlayed > 0) && !last) buckets.push('never');
  else buckets.push('played');
  if (last && NOW - last <= 30 * 86400000) buckets.push('recent');
  return buckets;
};
const tagsOf = (g) => [...new Set([...(g.tags || []), ...(g.autoTags || [])])];
const VALUES = {
  shelves: (g) => [g.me?.shelf || 'unshelved'],
  genres: (g) => g.genres || [],
  tags: tagsOf,
  storefronts: (g) => g.copies.map((c) => c.storefront),
  platforms: (g) => g.copies.map((c) => c.platform),
  formats: (g) => g.copies.map((c) => c.format),
  modes: (g) => g.modes || [],
  played: playedOf,
  lengths: (g) => [lengthOf(g)],
  metadata: (g) => [g.enrichment?.status || 'pending'],
};

function matches(g, f = {}, skip = null) {
  const has = (key, wanted, all = false) => {
    if (skip === key || !wanted?.length) return true;
    const vals = VALUES[key](g);
    return all ? wanted.every((w) => vals.includes(w)) : wanted.some((w) => vals.includes(w));
  };
  if (f.q && !g.title.toLowerCase().includes(String(f.q).toLowerCase())) return false;
  const all = f.tagMatch === 'all';
  if (!has('shelves', f.shelves) || !has('genres', f.genres, all) || !has('tags', f.tags, all)) return false;
  if (!has('storefronts', f.storefronts) || !has('platforms', f.platforms) || !has('formats', f.formats)) return false;
  if (!has('modes', f.modes) || !has('lengths', f.lengths) || !has('metadata', f.metadata)) return false;
  if (skip !== 'played' && f.played && !playedOf(g).includes(f.played)) return false;
  if (skip !== 'favorites' && f.favorite != null && Boolean(g.me?.favorite) !== f.favorite) return false;
  if (skip !== 'releaseYears') {
    if (f.releaseYearMin != null && !(g.releaseYear >= f.releaseYearMin)) return false;
    if (f.releaseYearMax != null && !(g.releaseYear <= f.releaseYearMax)) return false;
  }
  if (f.hasCover != null && Boolean(g.coverUrl) !== f.hasCover) return false;
  return true;
}

function facets(f = {}) {
  const tally = (key) => {
    const counts = new Map();
    GAMES.filter((g) => matches(g, f, key)).forEach((g) => [...new Set(VALUES[key](g))].forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)));
    return [...counts].map(([value, count]) => ({ __typename: 'GameFacetValue', value, count })).sort((a, b) => b.count - a.count);
  };
  const years = new Map();
  GAMES.filter((g) => matches(g, f, 'releaseYears')).forEach((g) => years.set(g.releaseYear, (years.get(g.releaseYear) || 0) + 1));
  return {
    __typename: 'GameFacets',
    total: GAMES.filter((g) => matches(g, f)).length,
    ...Object.fromEntries(Object.keys(VALUES).map((k) => [k, tally(k)])),
    releaseYears: [...years].sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ __typename: 'GameYearBucket', year, count })),
    favorites: GAMES.filter((g) => matches(g, f, 'favorites') && g.me?.favorite).length,
  };
}

let savedFilters = [...PROFILE.savedFilters];

export const OPS = {
  GetGames: (v) => {
    let items = GAMES.filter((g) => matches(g, v.filter || {}));
    if (v.owned) items = items.filter((g) => String(g.owned) === v.owned);
    if (v.sort === 'random') {
      const seed = Number(v.seed) || 1;
      items = [...items].sort((a, b) => ((Number(a.id.slice(1)) * seed) % 97) - ((Number(b.id.slice(1)) * seed) % 97));
    } else {
      items = [...items].sort(SORTERS[v.sort] || SORTERS.title);
      if (v.sortDir === 'desc') items.reverse();
    }
    return { games: { __typename: 'GamePage', games: items.map(strip), total: items.length, page: 1, pages: 1 } };
  },
  GetGameFacets: (v) => ({ gameFacets: facets(v.filter || {}) }),
  SetGameState: (v) => {
    const g = GAMES.find((x) => x.id === v.gameId) || GAMES[0];
    return { setGameState: strip({ ...g, me: { ...g.me, ...v.input } }) };
  },
  GetGame: (v) => ({ game: strip(GAMES.find((g) => g.id === v.id) || GAMES[0]) }),
  GetGameShelves: { gameShelves: SHELF_STATS },
  GetGameProfile: () => ({ gameProfile: { ...PROFILE, savedFilters } }),
  GetGameVocabulary: { gameVocabulary: VOCAB },
  SaveGameProfile: (v) => ({ saveGameProfile: { ...PROFILE, savedFilters, ...v.input } }),
  SaveGameFilter: (v) => {
    savedFilters = [...savedFilters, { __typename: 'GameSavedFilter', id: `v${savedFilters.length + 1}`, searchQuery: null, shelfFilter: null, platformFilter: null, ownedFilter: null, ...v.input }];
    return { saveGameFilter: { ...PROFILE, savedFilters } };
  },
  DeleteGameFilter: (v) => {
    savedFilters = savedFilters.filter((x) => x.id !== v.id);
    return { deleteGameFilter: { ...PROFILE, savedFilters } };
  },
};

export const PLAYNITE_DRY_RUN = {
  schemaVersion: 1,
  generatedAtUtc: '2026-09-25T16:21:03Z',
  total: 931,
  counts: { create: 42, addCopy: 6, update: 178, unchanged: 691, skippedHidden: 241, notInFile: 3, invalid: 0 },
  samples: {
    create: [
      { title: 'Outer Wilds', storefront: 'epic' },
      { title: 'Return of the Obra Dinn', storefront: 'gog' },
      { title: 'It Takes Two', storefront: 'ea' },
    ],
    addCopy: [{ title: "Baldur's Gate 3", storefront: 'gog' }],
    update: [
      { title: 'Hades', hoursBefore: 38.2, hoursAfter: 41.5 },
      { title: 'Stardew Valley', hoursBefore: 200.1, hoursAfter: 212.4 },
    ],
    notInFile: [{ title: 'Celeste' }],
  },
  committed: false,
};

export const SEARCH_RESULTS = {
  provider: 'steam-store',
  results: [
    { provider: 'steam-store', providerId: '1145360', title: 'Hades', releaseDate: T('2020-09-17'), developers: ['Supergiant Games'], publishers: ['Supergiant Games'], genres: ['Action', 'Indie', 'RPG'], description: 'Defy the god of the dead.', platforms: ['pc', 'mac'], modes: ['single'], coverUrl: '/harness-art/hades.svg', externalIds: { steamAppId: '1145360' } },
    { provider: 'steam-store', providerId: '1145350', title: 'Hades II', releaseDate: T('2025-09-25'), developers: ['Supergiant Games'], publishers: ['Supergiant Games'], genres: ['Action'], description: '', platforms: ['pc', 'switch', 'switch-2'], modes: ['single'], coverUrl: null, externalIds: { steamAppId: '1145350' } },
    { provider: 'steam-store', providerId: '237930', title: 'Transistor', releaseDate: T('2014-05-20'), developers: ['Supergiant Games'], publishers: ['Supergiant Games'], genres: ['Action', 'RPG'], description: '', platforms: ['pc', 'mac', 'linux'], modes: ['single'], coverUrl: '/harness-art/transistor.svg', externalIds: { steamAppId: '237930' } },
  ],
};

// Metadata & cover enrichment (DOCS/METADATA_ENRICHMENT.md). Status is fixed
// at running=true with IGDB/RAWG off — the scene the harness cares about is
// what live progress and a no-key notice look like, not a real worker.
export const METADATA_STATUS = {
  running: true,
  queued: 812,
  counts: { matched: 2, pending: 1, noMatch: 1, ambiguous: 1, error: 1, unlinked: 1 },
  providers: { steam: true, igdb: false, rawg: false },
  lastRunAt: T('2026-09-24'),
};

export const METADATA_CANDIDATES = {
  candidates: [
    { provider: 'steam', providerId: '1145360', title: 'Hades', year: 2020, coverUrl: '/harness-art/hades.svg', platforms: ['pc', 'switch', 'ps5', 'xbox-series'], wouldMatch: true },
    { provider: 'igdb', providerId: '113112', title: 'Hades', year: 2020, coverUrl: '/harness-art/hades.svg', platforms: ['pc', 'switch'], wouldMatch: false },
    { provider: 'rawg', providerId: '58990', title: 'Hades: Battle Out of Hell', year: 2018, coverUrl: null, platforms: ['pc'], wouldMatch: false },
  ],
};

// Stand-in box art: bold, flat, clearly "a real cover" next to the plates.
function coverSvg(title, color) {
  const t = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>` +
    `<rect width="600" height="800" fill="${color}"/>` +
    `<circle cx="420" cy="260" r="210" fill="#fff" fill-opacity=".08"/><circle cx="160" cy="520" r="140" fill="#000" fill-opacity=".18"/>` +
    `<rect width="600" height="800" fill="url(#g)"/>` +
    `<foreignObject x="44" y="560" width="512" height="220"><div xmlns="http://www.w3.org/1999/xhtml" style="font:800 52px/1.02 Impact,'Arial Black',sans-serif;color:#fff;text-transform:uppercase;letter-spacing:-.01em">${t}</div></foreignObject></svg>`;
}

export async function routes(ctx) {
  await sessionRoutes(ctx);
  await ctx.route('**/api/metadata/providers', (r) => json(r, { igdb: false, steamStore: true }));
  await ctx.route(/\/api\/metadata\/search/, (r) => json(r, SEARCH_RESULTS));
  await ctx.route(/\/harness-art\/([a-z]+)\.svg/, (r) => {
    const name = /\/harness-art\/([a-z]+)\.svg/.exec(r.request().url())[1];
    return svg(r, coverSvg(name === 'hades' ? 'Hades' : 'Transistor', name === 'hades' ? '#6b1d1d' : '#2c4a5e'));
  });
  await ctx.route(/\/api\/games\/([^/]+)\/cover/, (r) => {
    const id = /\/api\/games\/([^/]+)\/cover/.exec(r.request().url())[1];
    const g = GAMES.find((x) => x.id === id) || GAMES[1];
    return svg(r, coverSvg(g.title, g.coverColor || '#333'));
  });
  await ctx.route('**/api/metadata/enrich/status', (r) => json(r, METADATA_STATUS));
  await ctx.route('**/api/metadata/enrich/run', (r) => json(r, { started: true }, 202));
  await ctx.route(/\/api\/games\/([^/]+)\/metadata\/candidates/, (r) => json(r, METADATA_CANDIDATES));
  await ctx.route(/\/api\/games\/([^/]+)\/metadata\/refresh/, (r) => json(r, { enrichment: { __typename: 'GameEnrichment', ...ENRICHMENT.g1, status: 'pending' } }));
  await ctx.route(/\/api\/games\/([^/]+)\/metadata\/apply/, (r) => json(r, { enrichment: { __typename: 'GameEnrichment', ...ENRICHMENT.g1, manual: true } }));
  await ctx.route(/\/api\/games\/([^/]+)\/metadata\/unlink/, (r) =>
    json(r, { enrichment: { __typename: 'GameEnrichment', status: 'unlinked', provider: null, providerId: null, matchedTitle: null, matchedAt: null, attempts: 1, error: null, manual: false } })
  );
  await ctx.route('**/api/import/playnite', (r) => {
    // Multipart body — sniff the raw form data for the includeHidden field
    // rather than parsing it properly; good enough for a stubbed preview.
    const raw = r.request().postData() || '';
    const includeHidden = /name="includeHidden"[\s\S]*?\r?\n\r?\n\s*true/i.test(raw);
    if (!includeHidden) return json(r, PLAYNITE_DRY_RUN);
    const { create, skippedHidden } = PLAYNITE_DRY_RUN.counts;
    return json(r, { ...PLAYNITE_DRY_RUN, counts: { ...PLAYNITE_DRY_RUN.counts, create: create + skippedHidden, skippedHidden: 0 } });
  });
  await graphqlRoute(ctx, OPS);
}
