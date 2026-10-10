/**
 * Admin-only controls: hidden until the gateway says newsViewer.isAdmin.
 * (The gateway enforces the same rule; hiding is a courtesy, not the guard.)
 */
import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CHECK_NEWS_SOURCE_NOW } from '../../graphql/mutations';
import { GET_NEWS_PLACES, GET_NEWS_SOURCE, GET_NEWS_SOURCES } from '../../graphql/queries';
import SourceDetailView from '../../views/SourceDetailView';
import SourcesView from '../../views/SourcesView';
import { place, source, viewerMock } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const detailMock = { request: { query: GET_NEWS_SOURCE, variables: { id: 's1' } }, result: { data: { newsSource: source('s1', { name: 'The Arkadelphian' }) } } };
const listMock = { request: { query: GET_NEWS_SOURCES }, result: { data: { newsSources: [source('s1', { name: 'The Arkadelphian' })] } } };

const placesMock = { request: { query: GET_NEWS_PLACES }, result: { data: { newsPlaces: [place('clark', 'Clark County')] } } };

const renderDetail = (isAdmin, extra = []) =>
  renderWithProviders(<SourceDetailView />, { mocks: [viewerMock(isAdmin), detailMock, ...extra], initialEntries: ['/sources/s1'], path: '/sources/:id' });

describe('source detail', () => {
  it('a reader sees the record and no admin controls', async () => {
    renderDetail(false);
    expect(await screen.findByRole('heading', { level: 1, name: 'The Arkadelphian' })).toBeInTheDocument();
    // Let the viewer answer land before asserting absence.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: /check now/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByTestId('admin-actions')).toBeNull();
  });

  it('an admin gets Check now, Edit and the status control, and Check now calls newsCheckSourceNow', async () => {
    const checked = vi.fn(() => ({ data: { newsCheckSourceNow: source('s1', { name: 'The Arkadelphian' }) } }));
    renderDetail(true, [{ request: { query: CHECK_NEWS_SOURCE_NOW, variables: { id: 's1' } }, result: checked }]);
    const check = await screen.findByRole('button', { name: /check now/i });
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    await userEvent.click(check);
    expect(await screen.findByText(/Queued/)).toBeInTheDocument();
    expect(checked).toHaveBeenCalledTimes(1);
  });
});

describe('sources list', () => {
  it('hides "Add source" from a reader', async () => {
    renderWithProviders(<SourcesView />, { mocks: [viewerMock(false), listMock] });
    expect(await screen.findByRole('link', { name: 'The Arkadelphian' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: /add source/i })).toBeNull();
  });

  it('shows "Add source" to an admin, and it opens the form', async () => {
    renderWithProviders(<SourcesView />, { mocks: [viewerMock(true), listMock, placesMock] });
    await userEvent.click(await screen.findByRole('button', { name: /add source/i }));
    expect(await screen.findByRole('dialog', { name: 'Add a source' })).toBeInTheDocument();
  });
});
