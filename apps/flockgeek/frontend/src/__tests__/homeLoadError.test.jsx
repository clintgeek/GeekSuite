// SUITE_REVIEW_2026-11, FlockGeek 2: Home read only the birds query's error,
// so a failed egg (or groups, or hatches) read rendered "Eggs / day 0" — a
// bad connection told the keeper the hens had stopped laying. Any of the four
// Home reads failing with nothing to show must give the error with Retry,
// and never the zeros.

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import HomePage from '../pages/HomePage';
import { renderWithProviders } from './testUtils';
import {
  GET_BIRDS,
  GET_FLOCK_GROUPS,
  GET_EGG_PRODUCTIONS,
  GET_HATCH_EVENTS,
  GET_LOCATIONS,
} from '../graphql/queries';

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { name: 'chef' } }) }));
// The thumb-zone sheet registers a shell FAB; it is not what this test is about.
vi.mock('../components/QuickHarvestSheet', () => ({ default: () => null }));

const ok = {
  birds: { request: { query: GET_BIRDS, variables: {} }, result: { data: { birds: [] } } },
  groups: { request: { query: GET_FLOCK_GROUPS, variables: {} }, result: { data: { flockGroups: [] } } },
  hatches: { request: { query: GET_HATCH_EVENTS, variables: {} }, result: { data: { hatchEvents: [] } } },
  eggs: {
    request: { query: GET_EGG_PRODUCTIONS },
    variableMatcher: () => true,
    result: {
      data: {
        eggProductions: [
          {
            id: 'e1', date: '2026-11-15T00:00:00.000Z', eggsCount: 28, daysObserved: 1, locationId: null,
            avgEggWeightGrams: null, eggColor: null, eggSize: null, source: null, quality: null, notes: null,
          },
        ],
      },
    },
  },
  locations: { request: { query: GET_LOCATIONS, variables: {} }, result: { data: { flockLocations: [] } } },
};
const failing = (mock) => ({ ...mock, result: undefined, error: new Error('Network request failed') });

function renderHome(mocks) {
  return renderWithProviders(
    <MockedProvider mocks={mocks}>
      <HomePage />
    </MockedProvider>
  );
}

describe('Home — a failed read is not "0 eggs a day"', () => {
  for (const which of ['eggs', 'groups', 'hatches', 'birds']) {
    it(`shows the error with Retry, not zeros, when the ${which} read fails`, async () => {
      const mocks = Object.entries(ok).map(([k, m]) => (k === which ? failing(m) : m));
      renderHome(mocks);
      expect(await screen.findByText("Couldn't load your flock's numbers")).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      expect(screen.queryByText('Eggs / day')).not.toBeInTheDocument();
    });
  }

  it('Retry reads again and the numbers come back', async () => {
    const user = userEvent.setup();
    // The egg read fails once, then answers (MockedProvider consumes each mock once).
    const mocks = [ok.birds, ok.groups, ok.hatches, ok.locations, failing(ok.eggs),
      ok.birds, ok.groups, ok.hatches, ok.eggs];
    renderHome(mocks);
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByText('Eggs / day')).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument(); // 28 eggs / 14 days
    expect(screen.queryByText("Couldn't load your flock's numbers")).not.toBeInTheDocument();
  });

  it('draws the cards when every read answers', async () => {
    renderHome(Object.values(ok));
    expect(await screen.findByText('Eggs / day')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your flock's numbers")).not.toBeInTheDocument();
  });
});
