/**
 * Navigation after the front page (2026-10-11): the phone's tab bar is
 * Today · Everything · Sources; a section page lights Today; titles follow
 * the route. Routing: Everything keeps the section flags and the `?source=`
 * chip; `/s/:section` is that section, newest first, without the flags.
 */
import React from 'react';
import { screen, within } from '@testing-library/react';
import BottomTabs from '../../components/BottomTabs';
import { activeNavId, backFallback, tabFor, titleFor } from '../../components/navConfig';
import { AppRoutes } from '../../App';
import { GET_NEWS_ARTICLES, GET_NEWS_PREFS, GET_NEWS_SOURCE } from '../../graphql/queries';
import { article, source } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const prefsMock = { request: { query: GET_NEWS_PREFS }, result: { data: { newsPrefs: { __typename: 'NewsPrefs', freeToReadOnly: false, readerLinks: [] } } }, maxUsageCount: 5 };
const page = (items) => ({ data: { newsArticles: { __typename: 'NewsArticlePage', items, nextBefore: null, hiddenPaywalled: 0 } } });
const articlesMock = (variables, items) => ({ request: { query: GET_NEWS_ARTICLES, variables }, result: page(items), maxUsageCount: 3 });

describe('Bottom tabs', () => {
  const tabsAt = (path) => {
    renderWithProviders(<BottomTabs />, { initialEntries: [path] });
    const nav = screen.getByRole('navigation', { name: 'Tabs' });
    return within(nav).getAllByRole('link');
  };

  it('are Today · Everything · Sources, linking to /, /everything and /sources', () => {
    const links = tabsAt('/');
    expect(links.map((l) => l.textContent)).toEqual(['Today', 'Everything', 'Sources']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/everything', '/sources']);
  });

  it.each([
    ['/', 'Today'],
    ['/s/local', 'Today'],
    ['/everything', 'Everything'],
    ['/sources/s1', 'Sources'],
  ])('at %s the current tab is %s, and only that one', (path, current) => {
    const links = tabsAt(path);
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent)).toEqual([current]);
  });

  it('Settings lights no tab', () => {
    const links = tabsAt('/settings');
    expect(links.filter((l) => l.getAttribute('aria-current'))).toEqual([]);
  });
});

describe('navConfig', () => {
  it('titles: Today, Everything, a section by name, Source', () => {
    expect(titleFor('/')).toBe('Today');
    expect(titleFor('/everything')).toBe('Everything');
    expect(titleFor('/s/world')).toBe('World');
    expect(titleFor('/sources/abc')).toBe('Source');
  });

  it('nav ids and tabs; a deep-linked section page backs out to Today', () => {
    expect(activeNavId('/')).toBe('today');
    expect(activeNavId('/everything')).toBe('everything');
    expect(tabFor('/s/tech')).toBe('today');
    expect(backFallback('/s/tech')).toBe('/');
    expect(backFallback('/sources/abc')).toBe('/sources');
    expect(backFallback('/settings')).toBe('/');
  });
});

describe('Routes', () => {
  it('Everything keeps the section flags', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/everything'], mocks: [prefsMock, articlesMock({ limit: 30 }, [article('a1', { title: 'Everything headline' })])] });
    expect(await screen.findByRole('link', { name: /Everything headline/ })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Everything keeps the `?source=` chip', async () => {
    renderWithProviders(<AppRoutes />, {
      initialEntries: ['/everything?source=s1'],
      mocks: [
        prefsMock,
        articlesMock({ limit: 30, sourceId: 's1' }, [article('a1')]),
        { request: { query: GET_NEWS_SOURCE, variables: { id: 's1' } }, result: { data: { newsSource: source('s1', { name: 'The Arkadelphian' }) } } },
      ],
    });
    expect(await screen.findByTestId('source-filter')).toHaveTextContent('Showing: The Arkadelphian');
  });

  it('`/s/tech` is the Tech section, newest first: a heading, no flags, section sent', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/s/tech'], mocks: [prefsMock, articlesMock({ limit: 30, section: 'tech' }, [article('t1', { title: 'Tech headline' })])] });
    expect(await screen.findByRole('link', { name: /Tech headline/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Tech' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('an unknown section page goes to Today', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/s/sports'], mocks: [prefsMock] });
    expect(await screen.findByText('Today’s paper')).toBeInTheDocument();
  });
});
