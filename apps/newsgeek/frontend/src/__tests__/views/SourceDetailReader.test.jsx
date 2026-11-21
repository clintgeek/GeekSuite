/**
 * The Source page's reader block (UX review 2026-11-18, finding 5): the
 * Source sheet's "In my paper" and "I subscribe" rows, then the last five
 * headlines and "More from this source →"; admin tools under "At the desk".
 */
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SET_NEWS_SOURCE_ON, SET_NEWS_SOURCE_SUBSCRIBED } from '../../graphql/mutations';
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
const recentMock = (n, hiddenPaywalled = 0) => ({
  request: { query: GET_NEWS_ARTICLES, variables: { limit: 5, sourceId: 's1' } },
  result: { data: { newsArticles: { __typename: 'NewsArticlePage', items: Array.from({ length: n }, (_, i) => article(`r${i}`, { title: `Recent ${i}` })), nextCursor: null, hiddenPaywalled } } },
});
const recentFails = { request: { query: GET_NEWS_ARTICLES, variables: { limit: 5, sourceId: 's1' } }, error: new Error('network down') };

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

  it('a source that is off says it isn’t in your paper, not that it has nothing (and asks the gateway nothing)', async () => {
    // No articles mock: had the list been asked for, it would fail and show the error line.
    renderDetail(false, [detailMock({ onForMe: false }), prefsMock]);
    const note = await screen.findByTestId('detail-recent-note');
    expect(note).toHaveTextContent('The Arkadelphian isn’t in your paper, so its stories aren’t listed here. Turn on In my paper to see them.');
    expect(screen.queryByText(/Nothing from/)).toBeNull();
    expect(screen.queryByTestId('detail-recent-error')).toBeNull();
    expect(screen.queryByTestId('detail-more-from')).toBeNull();
  });

  it('asks again when a switch above lands (I subscribe brings back what Free to read left out)', async () => {
    const subscribe = {
      request: { query: SET_NEWS_SOURCE_SUBSCRIBED, variables: { id: 's1', on: true } },
      result: { data: { newsSetSourceSubscribed: { __typename: 'NewsSource', id: 's1', subscribedByMe: true } } },
    };
    renderDetail(false, [detailMock({ subscribedByMe: false, paywalled: true }), prefsMock, recentMock(0, 3), subscribe, recentMock(2)]);
    expect(await screen.findByTestId('detail-recent-note')).toHaveTextContent('Free to read leaves out The Arkadelphian’s stories.');
    await userEvent.click(screen.getByRole('switch', { name: 'I subscribe' }));
    const recent = screen.getByTestId('detail-recent');
    expect(await within(recent).findAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByTestId('detail-recent-note')).toBeNull();
  });

  it('a failed list says so and can try again', async () => {
    renderDetail(false, [detailMock(), prefsMock, recentFails, recentMock(1)]);
    const err = await screen.findByTestId('detail-recent-error');
    expect(err).toHaveTextContent('Couldn’t load the recent stories.');
    expect(screen.queryByText(/Nothing from/)).toBeNull();
    await userEvent.click(within(err).getByRole('button', { name: 'Try again' }));
    expect(await within(screen.getByTestId('detail-recent')).findAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByTestId('detail-recent-error')).toBeNull();
  });
});
