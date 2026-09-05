// Regression test for the calendar-date / instant off-by-one preserved
// deliberately while @geeksuite/utils landed (commit 1fc8623): FlockGeek's
// edit forms were reading stored UTC-midnight calendar dates (hatchDate,
// statusDate, startDate, endDate, setDate, pairing startDate) through
// `localDateString`, which walks the date back a day for anyone west of UTC.
// The fix reads them through `utcDateString` instead; `localDateString` stays
// for "today" defaults, which really are local instants.
//
// Proves the fix at the surface the bug was reported at — the edit form's
// prefilled value — for all four pages/seven sites named in the ticket.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { createFlockTheme } from '../theme/theme';
import { mockMatchMediaMatches } from './testUtils';
import BirdsPage from '../pages/BirdsPage';
import GroupsPage from '../pages/GroupsPage';
import HatchLogPage from '../pages/HatchLogPage';
import PairingsPage from '../pages/PairingsPage';
import {
  GET_BIRDS, GET_LOCATIONS, GET_FLOCK_GROUPS, GET_GROUP_MEMBERSHIPS,
  GET_HATCH_EVENTS, GET_PAIRINGS,
} from '../graphql/queries';

const theme = createFlockTheme('dark');

/**
 * Node re-reads `process.env.TZ` on every date operation (v16+), so the host
 * timezone can be driven from inside the test — same pattern as
 * packages/utils/src/__tests__/dates.test.js.
 */
const REAL_TZ = process.env.TZ;
afterEach(() => {
  if (REAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = REAL_TZ;
});

// A calendar date stored the suite's way: UTC midnight. Read through
// `localDateString(new Date(...))` in America/Chicago (UTC-6) this becomes
// "2026-01-14" — the bug. Read through `utcDateString` it stays "2026-01-15".
const STORED = '2026-01-15T00:00:00.000Z';
const EXPECTED = '2026-01-15';

function withProviders(ui, mocks) {
  return render(
    <MockedProvider mocks={mocks}>
      <ThemeProvider theme={theme}>
        <MemoryRouter>{ui}</MemoryRouter>
      </ThemeProvider>
    </MockedProvider>
  );
}

// Heavier than the suite's average test — real GraphQL round-trips plus a
// full form render — so they get more room under CPU contention (whole-suite
// runs) than vitest's 5s default.
const TEST_TIMEOUT = 15000;

describe('FlockGeek edit-form date prefill (utcDateString round trip, TZ=America/Chicago)', () => {
  let restoreMatchMedia;
  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = undefined;
  });

  it('BirdsPage: prefills Hatch Date and Status Date', async () => {
    process.env.TZ = 'America/Chicago';
    restoreMatchMedia = mockMatchMediaMatches(true); // mobile: Edit opens LedgerDialog
    const user = userEvent.setup();

    const bird = {
      id: 'b1', tagId: 'NC-001', name: 'Henrietta', sex: 'hen', breed: 'Buff Orpington',
      hatchDate: STORED, status: 'active', species: 'chicken', strain: '', cross: false,
      origin: 'own_egg', foundationStock: false, locationId: '', temperamentScore: null,
      statusDate: STORED, statusReason: '', notes: '', createdAt: STORED,
    };
    const mocks = [
      { request: { query: GET_BIRDS, variables: {} }, result: { data: { birds: [bird] } } },
      { request: { query: GET_LOCATIONS, variables: {} }, result: { data: { flockLocations: [] } } },
      { request: { query: GET_FLOCK_GROUPS, variables: {} }, result: { data: { flockGroups: [] } } },
      { request: { query: GET_GROUP_MEMBERSHIPS, variables: { activeOnly: true } }, result: { data: { groupMemberships: [] } } },
    ];

    withProviders(<BirdsPage />, mocks);

    await user.click(await screen.findByRole('button', { name: 'Actions for Henrietta' }));
    await user.click(await screen.findByRole('button', { name: 'Edit bird' }));

    expect(await screen.findByLabelText('Hatch Date')).toHaveValue(EXPECTED);
    expect(screen.getByLabelText('Status Date')).toHaveValue(EXPECTED);
  }, TEST_TIMEOUT);

  it('GroupsPage: prefills Start Date and End Date', async () => {
    process.env.TZ = 'America/Chicago';
    const user = userEvent.setup();

    const group = {
      id: 'g1', name: 'Layers', purpose: 'layer_flock', type: '',
      startDate: STORED, endDate: STORED, description: '', notes: '',
    };
    const mocks = [
      { request: { query: GET_FLOCK_GROUPS, variables: {} }, result: { data: { flockGroups: [group] } } },
      { request: { query: GET_GROUP_MEMBERSHIPS, variables: { activeOnly: true } }, result: { data: { groupMemberships: [] } } },
    ];

    withProviders(<GroupsPage />, mocks);

    await user.click(await screen.findByRole('button', { name: 'Edit Layers' }));

    expect(await screen.findByLabelText('Start Date')).toHaveValue(EXPECTED);
    expect(screen.getByLabelText('End Date')).toHaveValue(EXPECTED);
  }, TEST_TIMEOUT);

  it('HatchLogPage: prefills Set Date and Hatch Date', async () => {
    process.env.TZ = 'America/Chicago';
    restoreMatchMedia = mockMatchMediaMatches(true); // mobile: Edit lives in the row-action sheet
    const user = userEvent.setup();

    const event = {
      id: 'h1', pairingId: null, setDate: STORED, hatchDate: STORED,
      eggsSet: 12, eggsFertile: 10, chicksHatched: 8, pullets: 4, cockerels: 4, notes: '',
    };
    const mocks = [
      { request: { query: GET_HATCH_EVENTS, variables: {} }, result: { data: { hatchEvents: [event] } } },
    ];

    withProviders(<HatchLogPage />, mocks);

    await user.click(await screen.findByRole('button', { name: /^Actions for/ }));
    await user.click(await screen.findByRole('button', { name: 'Edit hatch' }));

    // "Set Date" is a required field — MUI appends a visible " *" to the
    // label, so match it as a prefix rather than an exact string.
    expect(await screen.findByLabelText(/^Set Date/)).toHaveValue(EXPECTED);
    expect(screen.getByLabelText('Hatch Date')).toHaveValue(EXPECTED);
  }, TEST_TIMEOUT);

  it('PairingsPage: prefills Pairing Date', async () => {
    process.env.TZ = 'America/Chicago';
    restoreMatchMedia = mockMatchMediaMatches(true); // mobile: Edit lives in the row-action sheet
    const user = userEvent.setup();

    const pairing = {
      id: 'p1', name: 'Spring Pair', roosterIds: [], henIds: [],
      startDate: STORED, endDate: null, active: true, notes: '', season: null, seasonYear: null,
    };
    const mocks = [
      { request: { query: GET_PAIRINGS, variables: {} }, result: { data: { pairings: [pairing] } } },
    ];

    withProviders(<PairingsPage />, mocks);

    await user.click(await screen.findByRole('button', { name: 'Actions for Spring Pair' }));
    await user.click(await screen.findByRole('button', { name: 'Edit pairing' }));

    expect(await screen.findByLabelText('Pairing Date')).toHaveValue(EXPECTED);
  }, TEST_TIMEOUT);
});
