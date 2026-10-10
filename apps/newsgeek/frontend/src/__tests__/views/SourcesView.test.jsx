import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GET_NEWS_SOURCES } from '../../graphql/queries';
import SourcesView from '../../views/SourcesView';
import { feed, source, viewerMock } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const SOURCES = [
  source('a', { name: 'Alpha Daily' }),
  source('b', { name: 'Bravo Times', feeds: [feed('b1', 'failing')] }),
  source('c', { name: 'Charlie Record', status: 'broken', feeds: [feed('c1', 'broken')] }),
  source('d', { name: 'Delta Notices', kind: 'official', feeds: [feed('d1', 'stale')] }),
  source('e', { name: 'Echo Retired', status: 'retired', feeds: [feed('e1', 'never')] }),
];

describe('Sources', () => {
  beforeEach(() => {
    renderWithProviders(<SourcesView />, { mocks: [viewerMock(false), { request: { query: GET_NEWS_SOURCES }, result: { data: { newsSources: SOURCES } } }] });
  });

  it('summarises the desk in one line and shows each feed’s health in words', async () => {
    expect(await screen.findByTestId('sources-summary')).toHaveTextContent('3 active · 1 failing · 1 broken');
    const bravo = screen.getAllByTestId('source-row').find((row) => within(row).queryByText('Bravo Times'));
    expect(within(bravo).getByText('Failing')).toBeInTheDocument();
    const delta = screen.getAllByTestId('source-row').find((row) => within(row).queryByText('Delta Notices'));
    expect(within(delta).getByTestId('official-badge')).toBeInTheDocument();
    expect(within(delta).getByText('Stale')).toBeInTheDocument();
  });

  it('filters by status, and "Needs attention" gathers stale, failing and broken', async () => {
    await screen.findByText('Alpha Daily');
    await userEvent.click(screen.getByRole('button', { name: /^Retired 1$/ }));
    expect(screen.getAllByTestId('source-row')).toHaveLength(1);
    expect(screen.getByText('Echo Retired')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Needs attention 3$/ }));
    expect(screen.getAllByTestId('source-row').map((r) => within(r).getByRole('heading').textContent)).toEqual(['Bravo Times', 'Charlie Record', 'Delta Notices']);
  });
});
