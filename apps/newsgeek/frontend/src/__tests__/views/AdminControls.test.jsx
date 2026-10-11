/**
 * Who gets which controls (plan "Reader-added sources" → Edit rights):
 * the adder (canEdit) or an admin get Check now / Edit / Retire; admins also
 * get the status menu and "On for everyone", and see addedByName. The + (Add
 * a source) is for every reader. (The gateway enforces the same rules; hiding
 * is a courtesy, not the guard.)
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CHECK_NEWS_SOURCE_NOW, SET_NEWS_SOURCE_DEFAULT_ON, SET_NEWS_SOURCE_STATUS } from '../../graphql/mutations';
import { GET_NEWS_PLACES, GET_NEWS_SOURCE, GET_NEWS_SOURCES, GET_NEWS_SUGGESTED_SOURCES } from '../../graphql/queries';
import SourceDetailView from '../../views/SourceDetailView';
import SourcesView from '../../views/SourcesView';
import { place, source, viewerMock, walledSource } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const detailMock = (overrides = {}) => ({
  request: { query: GET_NEWS_SOURCE, variables: { id: 's1' } },
  result: { data: { newsSource: source('s1', { name: 'The Arkadelphian', ...overrides }) } },
});
const listMock = { request: { query: GET_NEWS_SOURCES }, result: { data: { newsSources: [source('s1', { name: 'The Arkadelphian' })] } } };
const suggestedMock = { request: { query: GET_NEWS_SUGGESTED_SOURCES }, result: { data: { newsSuggestedSources: [] } } };
const placesMock = { request: { query: GET_NEWS_PLACES }, result: { data: { newsPlaces: [place('clark', 'Clark County')] } } };

const renderDetail = (isAdmin, overrides = {}, extra = []) =>
  renderWithProviders(<SourceDetailView />, { mocks: [viewerMock(isAdmin), detailMock(overrides), ...extra], initialEntries: ['/sources/s1'], path: '/sources/:id' });

// Let the viewer answer land before asserting absence.
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('source detail', () => {
  it('a paywalled source wears its badge in the header; a free one does not', async () => {
    const walled = { request: { query: GET_NEWS_SOURCE, variables: { id: 's2' } }, result: { data: { newsSource: walledSource('s2', 'hard', { name: 'Sentinel-Record' }) } } };
    renderWithProviders(<SourceDetailView />, { mocks: [viewerMock(false), walled], initialEntries: ['/sources/s2'], path: '/sources/:id' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Sentinel-Record' })).toBeInTheDocument();
    expect(screen.getByTestId('paywall-badge')).toHaveTextContent(/^Paywall$/);
  });

  it('a free source has no paywall badge', async () => {
    renderDetail(false);
    expect(await screen.findByRole('heading', { level: 1, name: 'The Arkadelphian' })).toBeInTheDocument();
    expect(screen.queryByTestId('paywall-badge')).toBeNull();
  });

  it('a reader who did not add it sees the record and no controls — and never addedByName', async () => {
    // Even if a name leaked through, a non-admin is not shown it.
    renderDetail(false, { addedByName: 'Heather', addedByMe: false, canEdit: false });
    expect(await screen.findByRole('heading', { level: 1, name: 'The Arkadelphian' })).toBeInTheDocument();
    await settle();
    expect(screen.queryByRole('button', { name: /check now/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /retire/i })).toBeNull();
    expect(screen.queryByTestId('source-actions')).toBeNull();
    expect(screen.queryByTestId('added-by')).toBeNull();
    expect(screen.queryByText(/Heather/)).toBeNull();
  });

  it('the adder (canEdit, not admin) gets Check now, Edit and Retire — no status menu, no "On for everyone" — and "Added by you"', async () => {
    const retired = vi.fn(() => ({ data: { newsSetSourceStatus: source('s1', { name: 'The Arkadelphian', status: 'retired', canEdit: true, addedByMe: true }) } }));
    renderDetail(false, { canEdit: true, addedByMe: true, defaultOn: false }, [
      { request: { query: SET_NEWS_SOURCE_STATUS, variables: { id: 's1', status: 'retired' } }, result: retired },
    ]);
    expect(await screen.findByRole('button', { name: /check now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).toBeNull();
    expect(screen.queryByRole('switch', { name: 'On for everyone' })).toBeNull();
    expect(screen.getByTestId('added-by')).toHaveTextContent('Added by you');
    await userEvent.click(screen.getByRole('button', { name: 'Retire' }));
    await waitFor(() => expect(retired).toHaveBeenCalledTimes(1));
  });

  it('an admin gets Check now, Edit, the status menu and "On for everyone", and sees who added it', async () => {
    const checked = vi.fn(() => ({ data: { newsCheckSourceNow: source('s1', { name: 'The Arkadelphian', canEdit: true, defaultOn: false, addedByName: 'Heather' }) } }));
    const everyone = vi.fn(() => ({ data: { newsSetSourceDefaultOn: { __typename: 'NewsSource', id: 's1', defaultOn: true, onForMe: true } } }));
    renderDetail(true, { canEdit: true, defaultOn: false, addedByName: 'Heather' }, [
      { request: { query: CHECK_NEWS_SOURCE_NOW, variables: { id: 's1' } }, result: checked },
      { request: { query: SET_NEWS_SOURCE_DEFAULT_ON, variables: { id: 's1', on: true } }, result: everyone },
    ]);
    const check = await screen.findByRole('button', { name: /check now/i });
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByTestId('added-by')).toHaveTextContent('Added by Heather');
    await userEvent.click(check);
    expect(await screen.findByText(/Queued/)).toBeInTheDocument();
    expect(checked).toHaveBeenCalledTimes(1);

    const sw = screen.getByRole('switch', { name: 'On for everyone' });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    await waitFor(() => expect(everyone).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('On for everyone.')).toBeInTheDocument();
  });
});

describe('sources list', () => {
  it('the + (Add a source) is there for a reader, and opens the Add sheet', async () => {
    renderWithProviders(<SourcesView />, { mocks: [viewerMock(false), listMock, suggestedMock, placesMock] });
    expect(await screen.findByRole('link', { name: 'The Arkadelphian' })).toBeInTheDocument();
    await settle();
    await userEvent.click(screen.getByRole('button', { name: 'Add a source' }));
    expect(await screen.findByRole('dialog', { name: /Add a source/ })).toBeInTheDocument();
    // "Enter the feed by hand" is the admin's.
    expect(screen.queryByRole('button', { name: /by hand/i })).toBeNull();
  });

  it('an admin can still enter a feed by hand from the sheet', async () => {
    renderWithProviders(<SourcesView />, { mocks: [viewerMock(true), listMock, suggestedMock, placesMock, placesMock] });
    await screen.findByRole('link', { name: 'The Arkadelphian' });
    await userEvent.click(screen.getByRole('button', { name: 'Add a source' }));
    await userEvent.click(await screen.findByRole('button', { name: /enter the feed by hand/i }));
    expect(await screen.findByRole('dialog', { name: 'Add a source' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Feed URL/)).toBeInTheDocument();
  });
});
