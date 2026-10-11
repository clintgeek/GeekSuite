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
  publisherDomain: 'arkadelphian.com',
  viaAggregator: false,
  alsoIn: [],
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
  pathExclude: [],
  notes: '',
  articlesLast7d: 12,
  paywalled: ['metered', 'hard'].includes(overrides.access?.paywall),
  defaultOn: true,
  onForMe: true,
  addedByMe: false,
  canEdit: false,
  addedByName: null,
  subscribedByMe: false,
  priorityForMe: 'normal',
  ...overrides,
});

/** A source with a paywall level (`paywalled` derived the way the gateway does). */
export const walledSource = (id, paywall, overrides = {}) =>
  source(id, { access: { __typename: 'NewsSourceAccess', paywall, content: 'excerpt' }, paywalled: paywall !== 'none', ...overrides });

export const viewerMock = (isAdmin) => ({
  request: { query: GET_NEWS_VIEWER },
  result: { data: { newsViewer: { __typename: 'NewsViewer', isAdmin } } },
});

/** Another copy of a story, as NewsArticle.alsoIn lists it. */
export const copy = (publisher, url, sourceId = `s-${publisher.toLowerCase()}`) => ({ __typename: 'NewsAlsoIn', publisher, url, sourceId });

/** A reader's open-with link as the gateway returns it (id = a hash of the template). */
export const readerLink = (id, label, template = `https://example.com/${id}?u={url}`) => ({ __typename: 'NewsReaderLink', id, label, template });

/** A per-publisher opener: exactly one of sourceId / domain. */
export const opener = ({ sourceId = null, domain = null, linkId }) => ({ __typename: 'NewsOpener', sourceId, domain: sourceId ? null : domain, linkId });

/** NewsPrefs as GET_NEWS_PREFS selects it (NewsPrefsFields), defaults filled in. */
export const newsPrefs = (overrides = {}) => ({
  __typename: 'NewsPrefs',
  freeToReadOnly: false,
  openInNewTab: true,
  readerLinks: [],
  openers: [],
  ...overrides,
});
