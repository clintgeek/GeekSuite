// NewsGeek fixtures (DOCS/NEWSGEEK_PLAN.md "Gateway API, N0"). A believable
// morning for Clark County, Arkansas: the two local papers, state, national,
// tech, and one OFFICIAL NWS alert. Shapes follow the app's own
// src/__tests__/fixtures.js.
//
// Modes, keyed on the page URL (the request's frame) so a scene can reach one
// with a plain deep link:
//   (none)                  admin, a full front page, every feed health state
//   ?__fixture=empty        admin, no stories yet
//   ?__fixture=nonadmin     a plain reader: newsViewer.isAdmin is false
//   ?__fixture=free         "Free to read" on: paywalled sources' items left out,
//                           hiddenPaywalled = 14
import { sessionRoutes, graphqlRoute } from '../../lib/net.mjs';

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

const P = (id, name, kind = 'county', parentId = null) => ({ __typename: 'NewsPlace', id, slug: id, name, kind, parentId });
const PLACES = [
  P('clark', 'Clark County'),
  P('hotspring', 'Hot Spring County'),
  P('arkadelphia', 'Arkadelphia', 'city', 'clark'),
  P('malvern', 'Malvern', 'city', 'hotspring'),
  P('arkansas', 'Arkansas', 'state'),
];
const pl = (id) => {
  const p = PLACES.find((x) => x.id === id);
  return { __typename: 'NewsPlace', id: p.id, name: p.name };
};

// ── Articles, newest first ──────────────────────────────────────────────────
const A = (id, mins, o) => ({
  __typename: 'NewsArticle',
  id,
  url: `https://example.com/${id}/`,
  excerpt: null,
  expiresAt: null,
  publishedAt: ago(mins),
  places: [],
  ...o,
});
const ARTICLES = [
  A('a1', 12, {
    title: 'Flash Flood Warning for Clark County',
    excerpt: 'The National Weather Service in Little Rock has issued a Flash Flood Warning for Clark County until 9:45 PM CDT. Move to higher ground now.',
    publisher: 'National Weather Service', sourceId: 's-nws', sourceName: 'NWS Little Rock', sourceKind: 'official',
    sections: ['local'], places: [pl('clark')], expiresAt: ago(-120),
  }),
  A('a2', 35, {
    title: 'Arkadelphia school board approves a calendar with a full week off at Thanksgiving',
    excerpt: 'Trustees voted 5-2 on Monday night after a long discussion about makeup days, bus routes and the cost of the extra days.',
    publisher: 'The Arkadelphian', sourceId: 's-ark', sourceName: 'The Arkadelphian', sourceKind: 'journalism',
    sections: ['local'], places: [pl('arkadelphia'), pl('clark')],
  }),
  A('a3', 70, {
    title: 'Malvern council weighs a request to rezone land along Highway 270 for a new distribution warehouse and truck stop, with a public hearing set for the first week of November',
    excerpt: 'Residents of the Ouachita Heights neighborhood say they were never notified.',
    publisher: 'Malvern Daily Record', sourceId: 's-mal', sourceName: 'Malvern Daily Record', sourceKind: 'journalism',
    sections: ['local'], places: [pl('malvern'), pl('hotspring')],
  }),
  A('a4', 95, {
    title: 'Fire damages a downtown Arkadelphia storefront',
    excerpt: '',
    publisher: 'The Arkadelphian', sourceId: 's-ark', sourceName: 'The Arkadelphian', sourceKind: 'journalism',
    sections: ['local'], places: [pl('arkadelphia')],
  }),
  A('a5', 140, {
    title: 'Little Rock man charged after a pursuit that ended on I-30 near Benton',
    excerpt: 'State police say speeds topped 100 mph before spike strips stopped the vehicle.',
    publisher: 'KATV', sourceId: 's-katv', sourceName: 'KATV', sourceKind: 'journalism',
    sections: ['state'], places: [pl('arkansas')],
  }),
  A('a6', 180, {
    title: 'Legislative panel hears testimony on rural hospital funding',
    excerpt: 'Administrators from eleven counties asked lawmakers to protect Medicaid reimbursement rates.',
    publisher: 'Arkansas Advocate', sourceId: 's-adv', sourceName: 'Arkansas Advocate', sourceKind: 'journalism',
    sections: ['state'], places: [pl('arkansas')],
  }),
  A('a7', 240, {
    title: 'Senate leaders say a stopgap spending bill is close',
    excerpt: 'Negotiators told reporters they expect a vote before the weekend.',
    publisher: 'NPR', sourceId: 's-npr', sourceName: 'NPR', sourceKind: 'journalism',
    sections: ['national'],
  }),
  A('a8', 300, {
    title: 'The kernel finally gets a better way to handle async I/O',
    excerpt: 'A years-long effort lands in the next release candidate.',
    publisher: 'Ars Technica', sourceId: 's-ars', sourceName: 'Ars Technica', sourceKind: 'journalism',
    sections: ['tech'],
  }),
];

// ── Sources, one per feed health state ──────────────────────────────────────
const F = (id, health, o = {}) => ({
  __typename: 'NewsFeed',
  id,
  url: `https://example.com/${id}/feed/`,
  format: 'rss',
  pollEveryMin: 30,
  lastFetchAt: health === 'never' ? null : ago(25),
  lastOkAt: health === 'ok' ? ago(25) : health === 'stale' ? ago(25) : health === 'failing' ? ago(600) : health === 'broken' ? ago(60 * 24 * 9) : null,
  lastItemAt: health === 'ok' ? ago(80) : health === 'stale' ? ago(60 * 24 * 12) : null,
  lastNewItemAt: health === 'ok' ? ago(80) : health === 'stale' ? ago(60 * 24 * 12) : null,
  consecutiveFailures: health === 'failing' ? 4 : health === 'broken' ? 31 : 0,
  lastError: health === 'failing' ? 'HTTP 429 Too Many Requests' : health === 'broken' ? 'getaddrinfo ENOTFOUND feeds.example.com' : null,
  lastHttpStatus: health === 'failing' ? 429 : health === 'broken' ? null : health === 'never' ? null : 200,
  stale: health === 'stale',
  health,
  ...o,
});
const S = (id, name, o = {}) => ({
  __typename: 'NewsSource',
  id,
  slug: id,
  name,
  homepage: `https://${id}.example.com/`,
  kind: 'journalism',
  sections: ['local'],
  places: [PLACES[0]],
  status: 'active',
  access: { __typename: 'NewsSourceAccess', paywall: 'none', content: 'excerpt' },
  feeds: [F(`${id}-f1`, 'ok')],
  blockedDomains: [],
  notes: '',
  articlesLast7d: 14,
  ...o,
  paywalled: ['metered', 'hard'].includes((o.access ?? {}).paywall),
});
const WALL = (paywall, content = 'excerpt') => ({ __typename: 'NewsSourceAccess', paywall, content });
const SOURCES = [
  S('s-ark', 'The Arkadelphian', { sections: ['local'], places: [PLACES[0], PLACES[2]], articlesLast7d: 22, feeds: [F('s-ark-f1', 'ok')] }),
  S('s-mal', 'Malvern Daily Record', { sections: ['local'], places: [PLACES[1], PLACES[3]], access: WALL('hard'), articlesLast7d: 9, feeds: [F('s-mal-f1', 'stale')] }),
  S('s-nws', 'NWS Little Rock', {
    kind: 'official', sections: ['local', 'state'], articlesLast7d: 3,
    feeds: [F('s-nws-f1', 'ok', { format: 'nws', url: 'https://api.weather.gov/alerts/active.atom?zone=ARC019', pollEveryMin: 15 })],
  }),
  S('s-katv', 'KATV', { sections: ['state'], places: [PLACES[4]], articlesLast7d: 31, feeds: [F('s-katv-f1', 'failing')] }),
  S('s-adv', 'Arkansas Advocate', { sections: ['state'], places: [PLACES[4]], status: 'broken', notes: 'Moved to a new CMS in September; the old feed 404s.', articlesLast7d: 0, feeds: [F('s-adv-f1', 'broken')] }),
  S('s-npr', 'NPR', { sections: ['national', 'world'], places: [], articlesLast7d: 120 }),
  S('s-verge', 'The Verge', { sections: ['tech'], places: [], access: WALL('metered'), articlesLast7d: 40 }),
  S('s-ars', 'Ars Technica', { sections: ['tech'], places: [], status: 'discovered', articlesLast7d: 0, feeds: [F('s-ars-f1', 'never')] }),
];

// ── Ops ─────────────────────────────────────────────────────────────────────
const fixtureOf = (pageUrl) => {
  try {
    return new URL(pageUrl).searchParams.get('__fixture') || '';
  } catch {
    return '';
  }
};

// `free`: the reader's "Free to read" switch is on — paywalled sources' items
// are left out and the page says how many were hidden.
const WALLED_IDS = new Set(SOURCES.filter((s) => s.paywalled).map((s) => s.id));
const articlesFor = (vars, mode) => {
  if (mode === 'empty') return { __typename: 'NewsArticlePage', items: [], nextBefore: null, hiddenPaywalled: 0 };
  const free = mode === 'free';
  const items = ARTICLES.filter((a) => (!vars.section || a.sections.includes(vars.section)) && (!vars.sourceId || a.sourceId === vars.sourceId) && !(free && WALLED_IDS.has(a.sourceId)));
  return { __typename: 'NewsArticlePage', items, nextBefore: ago(400), hiddenPaywalled: free ? 14 : 0 };
};

export async function routes(ctx) {
  await sessionRoutes(ctx);
  await graphqlRoute(ctx, (op, vars, r) => {
    let pageUrl = '';
    try {
      pageUrl = r.request().frame().url();
    } catch {
      pageUrl = '';
    }
    const mode = fixtureOf(pageUrl);
    switch (op) {
      case 'NewsViewer':
        return { newsViewer: { __typename: 'NewsViewer', isAdmin: mode !== 'nonadmin' } };
      case 'NewsPrefs':
        return { newsPrefs: { __typename: 'NewsPrefs', freeToReadOnly: mode === 'free' } };
      case 'NewsSetPrefs':
        return { newsSetPrefs: { __typename: 'NewsPrefs', freeToReadOnly: Boolean(vars.input?.freeToReadOnly) } };
      case 'NewsPlaces':
        return { newsPlaces: PLACES };
      case 'NewsArticles':
        return { newsArticles: articlesFor(vars, mode) };
      case 'NewsSources':
        return { newsSources: SOURCES };
      case 'NewsSource':
        return { newsSource: SOURCES.find((s) => s.id === vars.id) ?? null };
      default:
        return undefined;
    }
  });
}
