import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SET_NEWS_SOURCE_ON } from '../../graphql/mutations';
import { GET_NEWS_PLACES, GET_NEWS_SOURCES, GET_NEWS_SUGGESTED_SOURCES } from '../../graphql/queries';
import SourcesView from '../../views/SourcesView';
import { discoverSource } from '../../api/discover';
import { feed, place, source, viewerMock, walledSource } from '../fixtures';
import { renderWithProviders } from '../testUtils';

vi.mock('../../api/discover', async (importActual) => {
  const actual = await importActual();
  return { ...actual, discoverSource: vi.fn() };
});

const suggestedMock = (list = []) => ({ request: { query: GET_NEWS_SUGGESTED_SOURCES }, result: { data: { newsSuggestedSources: list } } });

const SOURCES = [
  source('a', { name: 'Alpha Daily' }),
  source('b', { name: 'Bravo Times', feeds: [feed('b1', 'failing')] }),
  source('c', { name: 'Charlie Record', status: 'broken', feeds: [feed('c1', 'broken')] }),
  source('d', { name: 'Delta Notices', kind: 'official', feeds: [feed('d1', 'stale')] }),
  source('e', { name: 'Echo Retired', status: 'retired', feeds: [feed('e1', 'never')] }),
  walledSource('f', 'metered', { name: 'Foxtrot Metered' }),
  walledSource('g', 'hard', { name: 'Golf Paywall' }),
];
const rowFor = (name) => screen.getAllByTestId('source-row').find((row) => within(row).queryByText(name));

describe('Sources', () => {
  beforeEach(() => {
    renderWithProviders(<SourcesView />, { mocks: [viewerMock(false), { request: { query: GET_NEWS_SOURCES }, result: { data: { newsSources: SOURCES } } }, suggestedMock()] });
  });

  it('summarises the desk in one line and shows each feed’s health in words', async () => {
    expect(await screen.findByTestId('sources-summary')).toHaveTextContent('5 active · 1 failing · 1 broken');
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

  it('badges paywalled sources in words — Paywall (hard), Metered — and never free ones', async () => {
    await screen.findByText('Golf Paywall');
    expect(within(rowFor('Golf Paywall')).getByTestId('paywall-badge')).toHaveTextContent(/^Paywall$/);
    expect(within(rowFor('Foxtrot Metered')).getByTestId('paywall-badge')).toHaveTextContent(/^Metered$/);
    expect(within(rowFor('Alpha Daily')).queryByTestId('paywall-badge')).toBeNull();
    expect(screen.getAllByTestId('paywall-badge')).toHaveLength(2);
    // Distinct from OFFICIAL: an official source carries no paywall badge, a paywalled one no official badge.
    expect(within(rowFor('Delta Notices')).queryByTestId('paywall-badge')).toBeNull();
    expect(within(rowFor('Golf Paywall')).queryByTestId('official-badge')).toBeNull();
  });
});

describe('Sources at 88 (UX review 2026-11-18, finding 4)', () => {
  beforeEach(() => {
    renderWithProviders(<SourcesView />, { mocks: [viewerMock(false), { request: { query: GET_NEWS_SOURCES }, result: { data: { newsSources: SOURCES } } }, suggestedMock()] });
  });

  it('"Find a source" narrows every section as you type, by name, ignoring case', async () => {
    await screen.findByText('Alpha Daily');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a source' }), 'charl');
    expect(screen.getAllByTestId('source-row').map((r) => within(r).getByRole('heading').textContent)).toEqual(['Charlie Record']);
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Find a source' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a source' }), 'zulu');
    expect(screen.queryAllByTestId('source-row')).toHaveLength(0);
    expect(screen.getByTestId('sources-none')).toHaveTextContent('No source called “zulu”.');
  });

  it('"Clear the search" empties the field and brings every row back', async () => {
    await screen.findByText('Alpha Daily');
    const all = screen.getAllByTestId('source-row').length;
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a source' }), 'charl');
    await userEvent.click(screen.getByRole('button', { name: 'Clear the search' }));
    expect(screen.getByRole('searchbox', { name: 'Find a source' })).toHaveValue('');
    expect(screen.getAllByTestId('source-row')).toHaveLength(all);
    // The button is gone with the text: focus goes back to the field, not to the page.
    expect(screen.getByRole('searchbox', { name: 'Find a source' })).toHaveFocus();
  });

  it('nothing found under a status filter says which filter, since the name may be under another', async () => {
    await screen.findByText('Alpha Daily');
    await userEvent.click(screen.getByRole('button', { name: /^Retired/ }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a source' }), 'alpha');
    expect(screen.queryAllByTestId('source-row')).toHaveLength(0);
    expect(screen.getByTestId('sources-none')).toHaveTextContent('No source called “alpha” under Retired.');
  });

  it('a row says its status once: not "Active", not "Broken" beside a broken feed, no On/Off text', async () => {
    await screen.findByText('Alpha Daily');
    expect(rowFor('Alpha Daily')).not.toHaveTextContent(/Active/);
    expect(within(rowFor('Charlie Record')).getAllByText(/Broken/)).toHaveLength(1);
    expect(rowFor('Echo Retired')).toHaveTextContent(/Retired/);
    expect(within(rowFor('Alpha Daily')).queryByText(/^(On|Off)$/)).toBeNull();
  });
});

describe('Sources sections, switches and suggestions', () => {
  const MIXED = [
    source('m1', { name: 'Mine Default', defaultOn: true, onForMe: true }),
    source('m2', { name: 'Mine Added', defaultOn: false, onForMe: true, addedByMe: true, canEdit: true }),
    source('o1', { name: 'Other Reader Paper', defaultOn: false, onForMe: false }),
    source('t1', { name: 'Turned Off Daily', defaultOn: true, onForMe: false }),
  ];
  const SUGGESTED = [
    {
      __typename: 'NewsSuggestion',
      domain: 'magnoliareporter.com',
      count: 14,
      lastSeenAt: '2026-10-10T10:00:00.000Z',
      places: [place('magnolia', 'Magnolia', 'city'), place('eldorado', 'El Dorado', 'city')],
      sampleTitles: ['A', 'B'],
      paywalled: true,
    },
    { __typename: 'NewsSuggestion', domain: 'free.example', count: 3, lastSeenAt: '2026-10-10T10:00:00.000Z', places: [], sampleTitles: [], paywalled: false },
  ];
  const listOf = (list) => ({ request: { query: GET_NEWS_SOURCES }, result: { data: { newsSources: list } } });
  const namesIn = (group) => within(screen.getByTestId(`group-${group}`)).queryAllByTestId('source-row').map((r) => within(r).getByRole('heading').textContent);

  it('groups sources: In your paper, From other readers, Turned off', async () => {
    renderWithProviders(<SourcesView />, { mocks: [viewerMock(false), listOf(MIXED), suggestedMock()] });
    await screen.findByText('Mine Default');
    expect(namesIn('mine')).toEqual(['Mine Added', 'Mine Default']);
    expect(namesIn('others')).toEqual(['Other Reader Paper']);
    expect(namesIn('off')).toEqual(['Turned Off Daily']);
    expect(within(screen.getByTestId('group-mine')).getByRole('heading', { level: 2 })).toHaveTextContent('In your paper');
    expect(screen.queryByTestId('group-retired')).toBeNull();
    // The summary line stays.
    expect(screen.getByTestId('sources-summary')).toHaveTextContent('4 active');
  });

  it('an empty section says so', async () => {
    renderWithProviders(<SourcesView />, { mocks: [viewerMock(false), listOf([MIXED[0]]), suggestedMock()] });
    await screen.findByText('Mine Default');
    expect(screen.getByTestId('group-others')).toHaveTextContent('Nobody else has added a source yet.');
    expect(screen.getByTestId('group-off')).toHaveTextContent('You haven’t turned anything off.');
    expect(await screen.findByText(/No suggestions/)).toBeInTheDocument();
  });

  it('a row’s switch calls newsSetSourceOn with the flipped value, and the row stays put', async () => {
    const calls = [];
    const setOn = (id, on) => ({
      request: { query: SET_NEWS_SOURCE_ON, variables: { id, on } },
      result: () => {
        calls.push({ id, on });
        return { data: { newsSetSourceOn: { __typename: 'NewsSource', id, onForMe: on, defaultOn: id === 't1' } } };
      },
    });
    renderWithProviders(<SourcesView />, { mocks: [viewerMock(false), listOf(MIXED), suggestedMock(), setOn('o1', true), setOn('m1', false)] });
    await screen.findByText('Other Reader Paper');
    const other = screen.getByRole('switch', { name: 'Other Reader Paper in your paper' });
    expect(other).not.toBeChecked();
    await userEvent.click(other);
    expect(other).toBeChecked();
    await waitFor(() => expect(calls).toEqual([{ id: 'o1', on: true }]));
    // Still under From other readers until the page is left.
    expect(namesIn('others')).toEqual(['Other Reader Paper']);

    await userEvent.click(screen.getByRole('switch', { name: 'Mine Default in your paper' }));
    await waitFor(() => expect(calls).toEqual([{ id: 'o1', on: true }, { id: 'm1', on: false }]));
  });

  it('lists suggestions as "domain — N stories — places" with a paywall badge, and Check opens the sheet on https://<domain>', async () => {
    discoverSource.mockReset();
    discoverSource.mockResolvedValue({ ok: false, message: 'No feed found — this site only publishes web pages', feeds: [] });
    renderWithProviders(<SourcesView />, {
      mocks: [viewerMock(false), listOf(MIXED), suggestedMock(SUGGESTED), { request: { query: GET_NEWS_PLACES }, result: { data: { newsPlaces: [] } } }],
    });
    const rows = await screen.findAllByTestId('suggestion');
    expect(rows[0]).toHaveTextContent('magnoliareporter.com — 14 stories — Magnolia, El Dorado');
    expect(within(rows[0]).getByTestId('paywall-badge')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('free.example — 3 stories');
    expect(within(rows[1]).queryByTestId('paywall-badge')).toBeNull();

    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Check magnoliareporter.com' }));
    expect(await screen.findByRole('dialog', { name: /Add a source/ })).toBeInTheDocument();
    await waitFor(() => expect(discoverSource).toHaveBeenCalledWith('https://magnoliareporter.com/', expect.anything()));
    expect(await screen.findByTestId('add-nofeed')).toBeInTheDocument();
  });
});
