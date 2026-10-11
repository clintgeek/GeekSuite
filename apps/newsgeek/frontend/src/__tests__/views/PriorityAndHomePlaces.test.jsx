/**
 * The reader's front-page prefs (2026-10-11):
 * - Priority on Today (★ Favorite / Normal / Less) on the Source sheet and the
 *   source's page → newsSetSourcePriority(id, priority);
 * - Settings → Home places: an ordered ring, closest first; move up / down,
 *   remove and add each save the whole ordered list (newsSetHomePlaces).
 */
import React from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GraphQLError } from 'graphql';
import { SET_NEWS_HOME_PLACES, SET_NEWS_SOURCE_PRIORITY } from '../../graphql/mutations';
import { GET_NEWS_HOME_PLACES, GET_NEWS_PLACES, GET_NEWS_SOURCE } from '../../graphql/queries';
import HomePlacesSettings from '../../components/HomePlacesSettings';
import SourceSheet from '../../components/SourceSheet';
import SourceDetailView from '../../views/SourceDetailView';
import { article, place, source, viewerMock } from '../fixtures';
import { renderWithProviders } from '../testUtils';

const sourceMock = (src) => ({ request: { query: GET_NEWS_SOURCE, variables: { id: src.id } }, result: { data: { newsSource: src } }, maxUsageCount: 5 });
const priorityMock = (id, priority, calls, extra = {}) => ({
  request: { query: SET_NEWS_SOURCE_PRIORITY, variables: { id, priority } },
  result: () => {
    calls.push(priority);
    return { data: { newsSetSourcePriority: { __typename: 'NewsSource', id, priorityForMe: priority } } };
  },
  ...extra,
});

describe('Priority on Today', () => {
  const ARK = source('s1', { name: 'The Arkadelphian' });

  it('the Source sheet shows the three choices, Normal pressed; Less sends priority "less" and tells the page', async () => {
    const calls = [];
    const onChanged = vi.fn();
    renderWithProviders(<SourceSheet article={article('d1')} open onClose={() => {}} onChanged={onChanged} />, {
      mocks: [sourceMock(ARK), priorityMock('s1', 'less', calls)],
    });
    const group = await screen.findByRole('group', { name: 'Priority on Today' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['★ Favorite', 'Normal', 'Less']);
    expect(within(group).getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: 'Less' }));
    await waitFor(() => expect(calls).toEqual(['less']));
    expect(within(group).getByRole('button', { name: 'Less' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('the source’s page sends priority "favorite"; pressing the current choice sends nothing', async () => {
    const calls = [];
    renderWithProviders(<SourceDetailView />, {
      path: '/sources/:id',
      initialEntries: ['/sources/s1'],
      mocks: [viewerMock(false), sourceMock(ARK), priorityMock('s1', 'favorite', calls)],
    });
    const group = await screen.findByRole('group', { name: 'Priority on Today' });
    await userEvent.click(within(group).getByRole('button', { name: 'Normal' }));
    // Nothing was sent, so nothing could fail.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Couldn’t change/)).toBeNull();
    await userEvent.click(within(group).getByRole('button', { name: 'Favorite' }));
    await waitFor(() => expect(calls).toEqual(['favorite']));
    expect(within(group).getByRole('button', { name: 'Favorite' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a refusal snaps back to the stored choice', async () => {
    renderWithProviders(<SourceSheet article={article('d1')} open onClose={() => {}} />, {
      mocks: [sourceMock(ARK), { request: { query: SET_NEWS_SOURCE_PRIORITY, variables: { id: 's1', priority: 'favorite' } }, result: { errors: [new GraphQLError('nope')] } }],
    });
    const group = await screen.findByRole('group', { name: 'Priority on Today' });
    await userEvent.click(within(group).getByRole('button', { name: 'Favorite' }));
    expect(await screen.findByText(/Couldn’t change The Arkadelphian’s priority/)).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Settings → Home places', () => {
  const ARK = place('ark', 'Arkadelphia', 'town');
  const CLARK = place('clark', 'Clark County');
  const HS = place('hs', 'Hot Springs', 'town');
  const LR = place('lr', 'Little Rock', 'town');
  const homeMock = (list) => ({ request: { query: GET_NEWS_HOME_PLACES }, result: { data: { newsPrefs: { __typename: 'NewsPrefs', homePlaces: list } } } });
  const placesMock = { request: { query: GET_NEWS_PLACES }, result: { data: { newsPlaces: [ARK, CLARK, HS, LR] } } };
  const saveMock = (ids, list, calls) => ({
    request: { query: SET_NEWS_HOME_PLACES, variables: { placeIds: ids } },
    result: () => {
      calls.push(ids);
      return { data: { newsSetHomePlaces: { __typename: 'NewsPrefs', homePlaces: list } } };
    },
  });
  const names = () => screen.getAllByTestId('home-place-name').map((n) => n.textContent);

  it('lists the ring closest first, with the helper line', async () => {
    renderWithProviders(<HomePlacesSettings />, { mocks: [homeMock([ARK, CLARK, HS]), placesMock] });
    await screen.findAllByTestId('home-place-row');
    expect(names()).toEqual(['Arkadelphia', 'Clark County', 'Hot Springs']);
    expect(screen.getByText('Stories tagged with these places are Local, closest first.')).toBeInTheDocument();
    // The ends can't move past the ends.
    expect(screen.getByRole('button', { name: 'Move Arkadelphia up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Hot Springs down' })).toBeDisabled();
  });

  it('move down saves the reordered list', async () => {
    const calls = [];
    renderWithProviders(<HomePlacesSettings />, { mocks: [homeMock([ARK, CLARK, HS]), placesMock, saveMock(['ark', 'hs', 'clark'], [ARK, HS, CLARK], calls)] });
    await userEvent.click(await screen.findByRole('button', { name: 'Move Clark County down' }));
    await waitFor(() => expect(calls).toEqual([['ark', 'hs', 'clark']]));
    expect(names()).toEqual(['Arkadelphia', 'Hot Springs', 'Clark County']);
  });

  it('move up saves the reordered list', async () => {
    const calls = [];
    renderWithProviders(<HomePlacesSettings />, { mocks: [homeMock([ARK, CLARK, HS]), placesMock, saveMock(['ark', 'hs', 'clark'], [ARK, HS, CLARK], calls)] });
    await userEvent.click(await screen.findByRole('button', { name: 'Move Hot Springs up' }));
    await waitFor(() => expect(calls).toEqual([['ark', 'hs', 'clark']]));
    expect(names()).toEqual(['Arkadelphia', 'Hot Springs', 'Clark County']);
  });

  it('remove saves the list without it', async () => {
    const calls = [];
    renderWithProviders(<HomePlacesSettings />, { mocks: [homeMock([ARK, CLARK, HS]), placesMock, saveMock(['ark', 'hs'], [ARK, HS], calls)] });
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Clark County' }));
    await waitFor(() => expect(calls).toEqual([['ark', 'hs']]));
    expect(names()).toEqual(['Arkadelphia', 'Hot Springs']);
  });

  it('"Add a place" offers only places not in the ring and appends the pick at the end', async () => {
    const calls = [];
    renderWithProviders(<HomePlacesSettings />, { mocks: [homeMock([ARK, CLARK]), placesMock, saveMock(['ark', 'clark', 'lr'], [ARK, CLARK, LR], calls)] });
    await screen.findAllByTestId('home-place-row');
    const input = screen.getByRole('combobox', { name: 'Add a place' });
    await waitFor(() => expect(input).toBeEnabled());
    await userEvent.click(input);
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['Hot SpringsTown', 'Little RockTown']);
    await userEvent.type(input, 'Little');
    await userEvent.click(await screen.findByRole('option', { name: /Little Rock/ }));
    await waitFor(() => expect(calls).toEqual([['ark', 'clark', 'lr']]));
    expect(names()).toEqual(['Arkadelphia', 'Clark County', 'Little Rock']);
    expect(input).toHaveValue('');
  });

  it('an empty ring says what Local means without one', async () => {
    renderWithProviders(<HomePlacesSettings />, { mocks: [homeMock([]), placesMock] });
    expect(await screen.findByTestId('home-places-empty')).toBeInTheDocument();
  });
});
