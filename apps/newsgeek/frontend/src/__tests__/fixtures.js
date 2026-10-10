import { GET_NEWS_VIEWER } from '../graphql/queries';

export const place = (id, name, kind = 'county') => ({ __typename: 'NewsPlace', id, slug: id, name, kind, parentId: null });

export const article = (id, overrides = {}) => ({
  __typename: 'NewsArticle',
  id,
  title: `Headline ${id}`,
  url: `https://arkadelphian.com/${id}/`,
  excerpt: `Excerpt for ${id}.`,
  publisher: 'The Arkadelphian',
  publishedAt: '2026-10-10T12:00:00.000Z',
  expiresAt: null,
  sourceId: 's1',
  sourceName: 'The Arkadelphian',
  sourceKind: 'journalism',
  sections: ['local'],
  places: [{ __typename: 'NewsPlace', id: 'clark', name: 'Clark County' }],
  ...overrides,
});

export const feed = (id, health, overrides = {}) => ({
  __typename: 'NewsFeed',
  id,
  url: `https://example.com/${id}/feed/`,
  format: 'rss',
  pollEveryMin: 30,
  lastFetchAt: health === 'never' ? null : '2026-10-10T11:00:00.000Z',
  lastOkAt: health === 'ok' || health === 'stale' ? '2026-10-10T11:00:00.000Z' : null,
  lastItemAt: null,
  lastNewItemAt: null,
  consecutiveFailures: health === 'failing' ? 2 : health === 'broken' ? 12 : 0,
  lastError: health === 'failing' || health === 'broken' ? 'HTTP 503' : null,
  lastHttpStatus: health === 'failing' || health === 'broken' ? 503 : 200,
  stale: health === 'stale',
  health,
  ...overrides,
});

export const source = (id, overrides = {}) => ({
  __typename: 'NewsSource',
  id,
  slug: id,
  name: `Source ${id}`,
  homepage: 'https://example.com/',
  kind: 'journalism',
  sections: ['local'],
  places: [place('clark', 'Clark County')],
  status: 'active',
  access: { __typename: 'NewsSourceAccess', paywall: 'none', content: 'excerpt' },
  feeds: [feed(`${id}-f1`, 'ok')],
  blockedDomains: [],
  notes: '',
  articlesLast7d: 12,
  paywalled: ['metered', 'hard'].includes(overrides.access?.paywall),
  ...overrides,
});

/** A source with a paywall level (`paywalled` derived the way the gateway does). */
export const walledSource = (id, paywall, overrides = {}) =>
  source(id, { access: { __typename: 'NewsSourceAccess', paywall, content: 'excerpt' }, paywalled: paywall !== 'none', ...overrides });

export const viewerMock = (isAdmin) => ({
  request: { query: GET_NEWS_VIEWER },
  result: { data: { newsViewer: { __typename: 'NewsViewer', isAdmin } } },
});
