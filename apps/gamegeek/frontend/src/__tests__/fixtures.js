export const makeGame = (over = {}) => ({
  __typename: 'Game',
  id: 'g1',
  title: 'Hades',
  sortTitle: 'hades',
  releaseYear: 2020,
  releaseDate: '2020-09-17T00:00:00.000Z',
  developers: ['Supergiant Games'],
  coverUrl: null,
  owned: true,
  platformsAvailable: ['pc', 'switch'],
  updatedAt: '2026-09-20T00:00:00.000Z',
  copies: [{ __typename: 'GameCopy', id: 'c1', platform: 'switch', format: 'physical', storefront: 'retail' }],
  me: {
    __typename: 'GameMyState',
    shelf: 'playing',
    rating: 4,
    progress: 40,
    hoursPlayed: 22.5,
    hoursSource: 'manual',
    favorite: false,
    lastPlayedAt: '2026-09-22T20:00:00.000Z',
  },
  ...over,
});

/** The full GameDetailFields shape (what every Game-returning mutation selects). */
export const makeDetailGame = (over = {}) => {
  const base = makeGame();
  return {
    ...base,
    parentId: null,
    series: null,
    publishers: [],
    description: '',
    genres: [],
    tags: [],
    autoTags: [],
    modes: [],
    maxLocalPlayers: null,
    timeToBeat: null,
    externalIds: null,
    enrichment: null,
    source: 'manual',
    createdAt: '2026-09-01T00:00:00.000Z',
    household: [],
    copies: base.copies.map((c) => ({ ...c, acquiredAt: null, notes: null, fromPlaynite: false, playtimeHours: null })),
    me: { ...base.me, review: '', notes: '', playthroughs: [], sessions: [] },
    ...over,
  };
};
