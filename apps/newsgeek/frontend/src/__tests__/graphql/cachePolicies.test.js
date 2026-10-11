/**
 * resetArticleLists drops every cached story list AND the cached front page:
 * each pref that changes what the gateway returns (Free to read, the Source
 * sheet, priority, home places) changes Today too.
 */
import { GET_NEWS_ARTICLES, GET_NEWS_FRONT_PAGE, GET_NEWS_PREFS } from '../../graphql/queries';
import { resetArticleLists } from '../../graphql/cachePolicies';
import { makeCache } from '../testUtils';

describe('resetArticleLists', () => {
  it('evicts newsArticles and newsFrontPage', () => {
    const cache = makeCache();
    cache.writeQuery({ query: GET_NEWS_FRONT_PAGE, data: { newsFrontPage: { __typename: 'NewsFrontPage', generatedAt: '2026-10-11T12:00:00.000Z', sections: [] } } });
    cache.writeQuery({ query: GET_NEWS_ARTICLES, variables: { limit: 30 }, data: { newsArticles: { __typename: 'NewsArticlePage', items: [], nextBefore: null, hiddenPaywalled: 0 } } });
    expect(cache.readQuery({ query: GET_NEWS_FRONT_PAGE })).not.toBeNull();
    resetArticleLists(cache);
    expect(cache.readQuery({ query: GET_NEWS_FRONT_PAGE })).toBeNull();
    expect(cache.readQuery({ query: GET_NEWS_ARTICLES, variables: { limit: 30 } })).toBeNull();
  });
});

// Opening (2026-10-11): a reader link's id is a hash of its template, so two
// links with one template share an id. They live inside NewsPrefs, never
// normalised, and a shorter list replaces a longer one whole.
describe('NewsPrefs lists', () => {
  const link = (id, label) => ({ __typename: 'NewsReaderLink', id, label, template: 'https://example.com/?u={url}' });
  const prefs = (readerLinks, openers = []) => ({
    newsPrefs: { __typename: 'NewsPrefs', freeToReadOnly: false, openInNewTab: true, readerLinks, openers },
  });

  it('keeps two links with the same id apart', () => {
    const cache = makeCache();
    cache.writeQuery({ query: GET_NEWS_PREFS, data: prefs([link('same', 'One'), link('same', 'Two')]) });
    expect(cache.readQuery({ query: GET_NEWS_PREFS }).newsPrefs.readerLinks.map((l) => l.label)).toEqual(['One', 'Two']);
  });

  it('a shorter openers list replaces the cached one', () => {
    const cache = makeCache();
    const o = (domain) => ({ __typename: 'NewsOpener', sourceId: null, domain, linkId: 'x' });
    cache.writeQuery({ query: GET_NEWS_PREFS, data: prefs([link('x', 'One')], [o('a.com'), o('b.com')]) });
    cache.writeQuery({ query: GET_NEWS_PREFS, data: prefs([link('x', 'One')], [o('b.com')]) });
    expect(cache.readQuery({ query: GET_NEWS_PREFS }).newsPrefs.openers.map((x) => x.domain)).toEqual(['b.com']);
  });
});
