import { NEWS_TYPE_POLICIES, resetArticleLists } from '../../graphql/cachePolicies';
import { hiddenPaywalledLine } from '../../utils/articles';
import { GET_NEWS_ARTICLES } from '../../graphql/queries';
import { article } from '../fixtures';
import { makeCache } from '../testUtils';

describe('hiddenPaywalledLine', () => {
  it('pluralises, and says nothing for zero or junk', () => {
    expect(hiddenPaywalledLine(14)).toBe('14 paywalled stories hidden');
    expect(hiddenPaywalledLine(1)).toBe('1 paywalled story hidden');
    expect(hiddenPaywalledLine(1200)).toBe('1,200 paywalled stories hidden');
    expect(hiddenPaywalledLine(0)).toBeNull();
    expect(hiddenPaywalledLine(undefined)).toBeNull();
  });
});

describe('resetArticleLists (a Free to read flip)', () => {
  it('drops every cached list, whatever its filter, so on and off never mix', () => {
    expect(NEWS_TYPE_POLICIES.Query.fields.newsArticles.keyArgs).toEqual(['section', 'placeId', 'sourceId']);
    const cache = makeCache();
    const pageOf = (id) => ({ newsArticles: { __typename: 'NewsArticlePage', items: [article(id)], nextBefore: null, hiddenPaywalled: 0 } });
    cache.writeQuery({ query: GET_NEWS_ARTICLES, variables: { limit: 30 }, data: pageOf('all1') });
    cache.writeQuery({ query: GET_NEWS_ARTICLES, variables: { limit: 30, section: 'tech' }, data: pageOf('tech1') });
    expect(cache.readQuery({ query: GET_NEWS_ARTICLES, variables: { limit: 30, section: 'tech' } })).not.toBeNull();
    resetArticleLists(cache);
    expect(cache.readQuery({ query: GET_NEWS_ARTICLES, variables: { limit: 30 } })).toBeNull();
    expect(cache.readQuery({ query: GET_NEWS_ARTICLES, variables: { limit: 30, section: 'tech' } })).toBeNull();
  });
});
