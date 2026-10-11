/**
 * resetArticleLists drops every cached story list AND the cached front page:
 * each pref that changes what the gateway returns (Free to read, the Source
 * sheet, priority, home places) changes Today too.
 */
import { GET_NEWS_ARTICLES, GET_NEWS_FRONT_PAGE } from '../../graphql/queries';
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
