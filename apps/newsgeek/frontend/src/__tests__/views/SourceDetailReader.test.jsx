/**
 * The Source page's reader block (UX review 2026-11-18, finding 5): the
 * Source sheet's "In my paper" and "I subscribe" rows, then the last five
 * headlines and "More from this source →"; admin tools under "At the desk".
 */
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SET_NEWS_SOURCE_ON } from '../../graphql/mutations';
import { GET_NEWS_ARTICLES, GET_NEWS_PREFS, GET_NEWS_SOURCE } from '../../graphql/queries';
import SourceDetailView from '../../views/SourceDetailView';
import { article, newsPrefs, source, viewerMock } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const detailMock = (overrides = {}) => ({
  request: { query: GET_NEWS_SOURCE, variables: { id: 's1' } },
  result: { data: { newsSource: source('s1', { name: 'The Arkadelphian', onForMe: true, ...overrides }) } },
  maxUsageCount: 5,
});
const prefsMock = { request: { query: GET_NEWS_PREFS }, result: { data: { newsPrefs: { ...newsPrefs(), readerLinks: [] } } } };
const recentMock = (n) => ({
  request: { query: GET_NEWS_ARTICLES, variables: { limit: 5, sourceId: 's1' } },
  result: { data: { newsArticles: { __typename: 'NewsArticlePage', items: Array.from({ length: n }, (_, i) => article(`r${i}`, { title: `Recent ${i}` })), nextCursor: null, hiddenPaywalled: 0 } } },
});

const renderDetail = (isAdmin, mocks) =>
  renderWithProviders(<SourceDetailView />, { mocks: [viewerMock(isAdmin), ...mocks], initialEntries: ['/sources/s1'], path: '/sources/:id' });

describe('the Source page’s reader block', () => {
  it('"In my paper" is a switch here too, and turning it off sends newsSetSourceOn(id, false)', async () => {
    const sent = vi.fn();
    const setOn = {
      request: { query: SET_NEWS_SOURCE_ON, variables: { id: 's1', on: false } },
      result: () => {
        sent();
        return { data: { newsSetSourceOn: { __typename: 'NewsSource', id: 's1', onForMe: false, defaultOn: true } } };
      },
    };
    renderDetail(false, [detailMock(), prefsMock, recentMock(2), setOn]);
    const sw = await screen.findByRole('switch', { name: 'In my paper' });
    expect(sw).toBeChecked();
    expect(screen.getByRole('switch', { name: 'I subscribe' })).toBeInTheDocument();
    await userEvent.click(sw);
    await waitFor(() => expect(sent).toHaveBeenCalled());
  });

  it('lists the recent headlines and leads to more from this source', async () => {
    renderDetail(false, [detailMock(), prefsMock, recentMock(5)]);
    const recent = await screen.findByTestId('detail-recent');
    expect(await within(recent).findAllByRole('listitem')).toHaveLength(5);
    expect(within(recent).getByRole('link', { name: /Recent 0/ })).toHaveAttribute('href', 'https://arkadelphian.com/r0/');
    expect(within(recent).getByRole('link', { name: 'More from this source →' })).toHaveAttribute('href', '/everything?source=s1');
  });

  it('the adder’s tools sit under "At the desk"; a reader has none', async () => {
    const { unmount } = renderDetail(false, [detailMock({ canEdit: true }), prefsMock, recentMock(0)]);
    expect(await screen.findByRole('heading', { name: 'At the desk' })).toBeInTheDocument();
    unmount();
    renderDetail(false, [detailMock({ canEdit: false }), prefsMock, recentMock(0)]);
    await screen.findByRole('switch', { name: 'In my paper' });
    expect(screen.queryByRole('heading', { name: 'At the desk' })).toBeNull();
  });
});
