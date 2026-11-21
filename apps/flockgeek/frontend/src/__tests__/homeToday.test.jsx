// UX review 2026-11-18, FlockGeek 2: Home never said whether today's eggs
// were logged — the question a keeper opens the app with. A "Today" line
// under the greeting answers it.

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { localDateString } from '@geeksuite/utils';
import HomePage from '../pages/HomePage';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, mockMatchMediaMatches } from './testUtils';
import {
  GET_BIRDS,
  GET_FLOCK_GROUPS,
  GET_EGG_PRODUCTIONS,
  GET_HATCH_EVENTS,
  GET_LOCATIONS,
} from '../graphql/queries';

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { name: 'chef' } }) }));
// The sheet is stubbed: closed it renders nothing (as at md+); open, it offers
// one button that does what the real sheet does on a logged harvest — close
// itself through onOpenChange, then call onSuccess.
vi.mock('../components/QuickHarvestSheet', () => ({
  default: ({ open, onOpenChange, onSuccess }) =>
    open ? (
      <button type="button" onClick={() => { onOpenChange(false); onSuccess?.(); }}>
        Stub log harvest
      </button>
    ) : null,
}));

const egg = (id, date, eggsCount, locationId) => ({
  id, date, eggsCount, daysObserved: 1, locationId,
  avgEggWeightGrams: null, eggColor: null, eggSize: null, source: null, quality: null, notes: null,
});

function mocks(eggs) {
  return [
    { request: { query: GET_BIRDS, variables: {} }, result: { data: { birds: [] } } },
    { request: { query: GET_FLOCK_GROUPS, variables: {} }, result: { data: { flockGroups: [] } } },
    { request: { query: GET_HATCH_EVENTS, variables: {} }, result: { data: { hatchEvents: [] } } },
    { request: { query: GET_EGG_PRODUCTIONS }, variableMatcher: () => true, result: { data: { eggProductions: eggs } } },
    {
      request: { query: GET_LOCATIONS, variables: {} },
      result: { data: { flockLocations: [{ id: 'north', name: 'North Coop', type: 'coop', capacity: null, isActive: true, description: null, notes: null }] } },
    },
  ];
}

const render = (eggs) =>
  renderWithProviders(
    <MockedProvider mocks={mocks(eggs)}>
      <HomePage />
    </MockedProvider>
  );

describe('Home — Today', () => {
  it('says when today is not logged yet, with a way to log it', async () => {
    render([egg('e1', '2020-01-01T00:00:00.000Z', 8, 'north')]);
    const today = await screen.findByTestId('home-today');
    expect(today).toHaveTextContent('Today: not logged yet');
    expect(screen.getByRole('link', { name: 'Log eggs' })).toHaveAttribute('href', '/egg-log');
  });

  it("says how many eggs are in today, and from which pen", async () => {
    const todayIso = `${localDateString(new Date())}T00:00:00.000Z`;
    render([egg('e1', todayIso, 9, 'north'), egg('e0', '2020-01-01T00:00:00.000Z', 8, 'north')]);
    const today = await screen.findByTestId('home-today');
    expect(await screen.findByText(/9 eggs · North Coop/)).toBeInTheDocument();
    expect(today).not.toHaveTextContent('not logged yet');
  });

  // Review 2026-11-20: on the phone the Today line's "Log eggs" opens the
  // sheet in place; once the log lands that button is gone, so the sheet's
  // focus return dropped to the page body. Focus goes to the Today line.
  it('after logging from the Today line on a phone, focus is on the Today line', async () => {
    const restore = mockMatchMediaMatches(true);
    try {
      const user = userEvent.setup();
      render([egg('e1', '2020-01-01T00:00:00.000Z', 8, 'north')]);
      const today = await screen.findByTestId('home-today');
      await user.click(screen.getByRole('button', { name: 'Log eggs' }));
      await user.click(await screen.findByRole('button', { name: 'Stub log harvest' }));
      await waitFor(() => expect(document.activeElement).toBe(today));
    } finally {
      restore();
    }
  }, 30000);
});
