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
];

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
  createdAt: T(`2026-0${(i % 8) + 1}-10`),
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
  tags: [],
  modes: id === 'g8' || id === 'g13' ? ['single', 'coop-local', 'pvp-online'] : ['single'],
  maxLocalPlayers: id === 'g8' ? 4 : null,
  timeToBeat: id === 'g1' ? { __typename: 'GameTimeToBeat', main: 22, extra: 48, complete: 95 } : null,
  externalIds: id === 'g1' ? { __typename: 'GameExternalIds', igdb: '113112', steamAppId: '1145360', rawg: null, gog: null, epic: null } : null,
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
        lastPlayedAt: shelf === 'playing' ? T('2026-09-23') : null,
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
  platforms: ['pc', 'steam-deck', 'switch', 'ps5', 'ios', 'snes'].map((p) => ({
    __typename: 'GameShelfCount', shelf: p, count: GAMES.filter((g) => g.copies.some((c) => c.platform === p)).length,
  })),
};

export const PROFILE = {
  __typename: 'GameProfile',
  customShelves: [{ __typename: 'GameCustomShelf', id: 'custom-couch-coop', label: 'Couch co-op' }],
  savedFilters: [],
  platformsOwned: ['pc', 'steam-deck', 'switch', 'ps5', 'ios'],
  defaultPlatform: 'switch',
  steamId: '',
  lastSteamSyncAt: null,
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

const SORTERS = {
  title: (a, b) => a.sortTitle.localeCompare(b.sortTitle),
  dateAdded: (a, b) => a.createdAt.localeCompare(b.createdAt),
  releaseDate: (a, b) => a.releaseDate.localeCompare(b.releaseDate),
  rating: (a, b) => (a.me?.rating || 0) - (b.me?.rating || 0),
  lastPlayed: (a, b) => String(a.me?.lastPlayedAt || '').localeCompare(String(b.me?.lastPlayedAt || '')),
  hoursPlayed: (a, b) => (a.me?.hoursPlayed || 0) - (b.me?.hoursPlayed || 0),
};

export const OPS = {
  GetGames: (v) => {
    let items = GAMES;
    if (v.shelf) items = items.filter((g) => (v.shelf === 'unshelved' ? !g.me?.shelf : g.me?.shelf === v.shelf));
    if (v.platform) items = items.filter((g) => g.copies.some((c) => c.platform === v.platform));
    if (v.owned) items = items.filter((g) => String(g.owned) === v.owned);
    if (v.q) items = items.filter((g) => g.title.toLowerCase().includes(String(v.q).toLowerCase()));
    items = [...items].sort(SORTERS[v.sort] || SORTERS.title);
    if (v.sortDir === 'desc') items.reverse();
    return { games: { __typename: 'GamePage', games: items.map(strip), total: items.length, page: 1, pages: 1 } };
  },
  GetGame: (v) => ({ game: strip(GAMES.find((g) => g.id === v.id) || GAMES[0]) }),
  GetGameShelves: { gameShelves: SHELF_STATS },
  GetGameProfile: { gameProfile: PROFILE },
  GetGameVocabulary: { gameVocabulary: VOCAB },
  SaveGameProfile: (v) => ({ saveGameProfile: { ...PROFILE, ...v.input } }),
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

export const STEAM_DRY_RUN = {
  configured: true,
  total: 184,
  toCreate: [
    ['620', 'Portal 2', 0], ['413150', 'Stardew Valley', 212.4], ['1145360', 'Hades', 41.5], ['367520', 'Hollow Knight', 0],
    ['1794680', 'Vampire Survivors', 18.2], ['588650', 'Dead Cells', 7], ['646570', 'Slay the Spire', 96], ['1086940', "Baldur's Gate 3", 3.5],
    ['504230', 'Celeste', 14],
  ].map(([steamAppId, title, hours]) => ({ steamAppId, title, hours })),
  toUpdateHours: [{ gameId: 'g7', title: "Baldur's Gate 3", hours: 5.2 }],
  unchanged: 12,
};

export const SEARCH_RESULTS = {
  provider: 'steam-store',
  results: [
    { provider: 'steam-store', providerId: '1145360', title: 'Hades', releaseDate: T('2020-09-17'), developers: ['Supergiant Games'], publishers: ['Supergiant Games'], genres: ['Action', 'Indie', 'RPG'], description: 'Defy the god of the dead.', platforms: ['pc', 'mac'], modes: ['single'], coverUrl: '/harness-art/hades.svg', externalIds: { steamAppId: '1145360' } },
    { provider: 'steam-store', providerId: '1145350', title: 'Hades II', releaseDate: T('2025-09-25'), developers: ['Supergiant Games'], publishers: ['Supergiant Games'], genres: ['Action'], description: '', platforms: ['pc', 'switch', 'switch-2'], modes: ['single'], coverUrl: null, externalIds: { steamAppId: '1145350' } },
    { provider: 'steam-store', providerId: '237930', title: 'Transistor', releaseDate: T('2014-05-20'), developers: ['Supergiant Games'], publishers: ['Supergiant Games'], genres: ['Action', 'RPG'], description: '', platforms: ['pc', 'mac', 'linux'], modes: ['single'], coverUrl: '/harness-art/transistor.svg', externalIds: { steamAppId: '237930' } },
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
  await ctx.route('**/api/metadata/providers', (r) => json(r, { igdb: false, steamStore: true, steamImport: true }));
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
  await ctx.route('**/api/import/steam', (r) => json(r, STEAM_DRY_RUN));
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
