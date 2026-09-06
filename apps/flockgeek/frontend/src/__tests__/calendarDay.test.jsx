// Going-over 2026-09-05 — the read side of the calendar-date/instant split.
//
// `dateRoundTrip.test.jsx` (commit 1fc8623) pinned the *edit form prefill*.
// These pin the three places the same two kinds of date were still being mixed
// where a user can see it:
//
//   1. HatchLogPage's "Hatched" / "Incubating" chip compared a UTC-midnight
//      calendar day to `new Date()`, so a clutch due tomorrow read as hatched
//      from 6pm tonight in US Central.
//   2. HatchLogPage's End Date filter compared the gateway's serialized ISO
//      instant ("2026-09-05T00:00:00.000Z") to the `YYYY-MM-DD` an
//      `<input type="date">` produces. The ISO string always sorts *after* the
//      bare day it names, so the last day of any range was dropped.
//   3. GroupsPage's Active/Ended chip had the same instant comparison as (1),
//      shifting the whole window a day west of UTC.
//
// Plus the fourth thing found in the same pass, which is not a date bug: the
// Add-hatch dialog collected five fields it never sent.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { createFlockTheme } from '../theme/theme';
import HatchLogPage from '../pages/HatchLogPage';
import GroupsPage from '../pages/GroupsPage';
import { GET_HATCH_EVENTS, GET_FLOCK_GROUPS, GET_GROUP_MEMBERSHIPS } from '../graphql/queries';
import { RECORD_HATCH_EVENT, UPDATE_HATCH_EVENT } from '../graphql/mutations';
import { print } from 'graphql';

const theme = createFlockTheme('dark');
const TEST_TIMEOUT = 15000;

// Node re-reads process.env.TZ on every date operation (v16+), so the host
// timezone is set from inside the test — same pattern as dateRoundTrip.
const REAL_TZ = process.env.TZ;
afterEach(() => {
  vi.useRealTimers();
  if (REAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = REAL_TZ;
});

function withProviders(ui, mocks) {
  return render(
    <MockedProvider mocks={mocks}>
      <ThemeProvider theme={theme}>
        <MemoryRouter>{ui}</MemoryRouter>
      </ThemeProvider>
    </MockedProvider>
  );
}

/**
 * Pin the wall clock without stopping it.
 *
 * `shouldAdvanceTime` matters: Apollo's MockedProvider, RTL's `findBy*` and
 * user-event all wait on real timers, so a fully frozen clock deadlocks the
 * render before anything is asserted.
 */
function freezeClockAt(iso) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(iso));
}

/** A calendar day stored the suite's way. */
const utcDay = (ymd) => `${ymd}T00:00:00.000Z`;

const hatchEvent = (overrides) => ({
  id: 'h1',
  pairingId: null,
  setDate: utcDay('2026-09-05'),
  hatchDate: null,
  eggsSet: 12,
  eggsFertile: null,
  chicksHatched: null,
  pullets: null,
  cockerels: null,
  notes: '',
  ...overrides,
});

// "Hatched" is also a *column header* (chicksHatched), so a bare text query
// matches two nodes. The status chip is the one that matters here.
const CHIP = { selector: '.MuiChip-label' };

const hatchMocks = (events) => [
  { request: { query: GET_HATCH_EVENTS, variables: {} }, result: { data: { hatchEvents: events } } },
];

describe('HatchLogPage — the Hatched chip reads a calendar day, not an instant', () => {
  it('a hatch dated tomorrow still reads "Incubating" on tonight\'s clock in US Central', async () => {
    process.env.TZ = 'America/Chicago';
    // 2026-09-05 19:00 America/Chicago == 2026-09-06 00:00 UTC. The old
    // comparison (`new Date(hatchDate) <= new Date()`) is true here for a
    // hatchDate of 2026-09-06, because that value *is* this instant.
    freezeClockAt('2026-09-06T00:00:00.000Z');

    withProviders(
      <HatchLogPage />,
      hatchMocks([hatchEvent({ hatchDate: utcDay('2026-09-06') })])
    );

    expect(await screen.findByText('Incubating', CHIP)).toBeInTheDocument();
    expect(screen.queryByText('Hatched', CHIP)).not.toBeInTheDocument();
  }, TEST_TIMEOUT);

  it('a hatch dated today reads "Hatched"', async () => {
    process.env.TZ = 'America/Chicago';
    freezeClockAt('2026-09-06T00:00:00.000Z'); // 2026-09-05 19:00 local

    withProviders(
      <HatchLogPage />,
      hatchMocks([hatchEvent({ hatchDate: utcDay('2026-09-05') })])
    );

    expect(await screen.findByText('Hatched', CHIP)).toBeInTheDocument();
    expect(screen.queryByText('Incubating', CHIP)).not.toBeInTheDocument();
  }, TEST_TIMEOUT);
});

describe('HatchLogPage — the End Date filter includes its own day', () => {
  it('keeps the event set on the end date', async () => {
    const user = userEvent.setup();
    withProviders(
      <HatchLogPage />,
      hatchMocks([
        hatchEvent({ id: 'h1', setDate: utcDay('2026-09-05'), eggsSet: 12 }),
        hatchEvent({ id: 'h2', setDate: utcDay('2026-09-09'), eggsSet: 7 }),
      ])
    );

    // Both rows present to start with.
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    await user.type(screen.getByLabelText('End Date'), '2026-09-05');

    // The 5th survives its own end-date filter; the 9th is filtered out.
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  }, TEST_TIMEOUT);

  it('keeps the event set on the start date', async () => {
    const user = userEvent.setup();
    withProviders(
      <HatchLogPage />,
      hatchMocks([
        hatchEvent({ id: 'h1', setDate: utcDay('2026-09-05'), eggsSet: 12 }),
        hatchEvent({ id: 'h2', setDate: utcDay('2026-09-01'), eggsSet: 7 }),
      ])
    );

    expect(await screen.findByText('12')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Start Date'), '2026-09-05');

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  }, TEST_TIMEOUT);
});

describe('HatchLogPage — Add hatch sends every field it collects', () => {
  // A variable passed in `variables` but never *declared* by the operation is
  // dropped by GraphQL without a word — no error, no warning, no field set.
  // That is exactly how the Add dialog's Hatch Date went nowhere, and it is
  // invisible to a MockedProvider test (the mock matches on the variables
  // object, which still carries the extra key). Assert the document itself.
  it('declares $hatchDate on the create mutation', () => {
    const doc = print(RECORD_HATCH_EVENT);
    expect(doc).toContain('$hatchDate: Date');
    expect(doc).toContain('hatchDate: $hatchDate');
  });


  it('sends hatchDate on create and the post-hatch counts as a follow-up update', async () => {
    const user = userEvent.setup();

    let createVars = null;
    let updateVars = null;

    const mocks = [
      ...hatchMocks([]),
      {
        request: {
          query: RECORD_HATCH_EVENT,
          variables: {
            setDate: '2026-09-05',
            hatchDate: '2026-09-26',
            eggsSet: 12,
            notes: undefined,
          },
        },
        result: () => {
          createVars = true;
          return { data: { recordHatchEvent: { id: 'h-new', __typename: 'HatchEvent' } } };
        },
      },
      {
        request: {
          query: UPDATE_HATCH_EVENT,
          variables: {
            id: 'h-new',
            eggsFertile: 10,
            chicksHatched: 8,
            pullets: 5,
            cockerels: 3,
          },
        },
        result: () => {
          updateVars = true;
          return { data: { updateHatchEvent: { id: 'h-new', __typename: 'HatchEvent' } } };
        },
      },
      ...hatchMocks([]),
      ...hatchMocks([]),
    ];

    withProviders(<HatchLogPage />, mocks);

    await user.click(await screen.findByRole('button', { name: 'Add Hatch' }));

    const dialog = await screen.findByRole('dialog');
    const field = (name) => within(dialog).getByLabelText(name);

    await user.type(field(/^Set Date/), '2026-09-05');
    await user.type(field('Hatch Date'), '2026-09-26');
    await user.type(field(/^Eggs Set/), '12');
    await user.type(field('Fertile Eggs'), '10');
    await user.type(field('Chicks Hatched'), '8');
    await user.type(field('Pullets'), '5');
    await user.type(field('Cockerels'), '3');

    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    // Both mocks matched: an unmatched MockedProvider request errors instead,
    // so reaching here with both flags set is the assertion.
    await vi.waitFor(() => {
      expect(createVars).toBe(true);
      expect(updateVars).toBe(true);
    }, { timeout: 5000 });
  }, TEST_TIMEOUT);
});

describe('GroupsPage — the Active chip reads calendar days', () => {
  const groupMocks = (groups) => [
    { request: { query: GET_FLOCK_GROUPS, variables: {} }, result: { data: { flockGroups: groups } } },
    { request: { query: GET_GROUP_MEMBERSHIPS, variables: { activeOnly: true } }, result: { data: { groupMemberships: [] } } },
  ];

  const group = (overrides) => ({
    id: 'g1',
    name: 'Layers',
    purpose: 'layer_flock',
    type: '',
    startDate: utcDay('2026-09-01'),
    endDate: null,
    description: '',
    notes: '',
    ...overrides,
  });

  it('a group starting tomorrow is not Active tonight in US Central', async () => {
    process.env.TZ = 'America/Chicago';
    freezeClockAt('2026-09-06T00:00:00.000Z'); // 2026-09-05 19:00 local

    withProviders(<GroupsPage />, groupMocks([group({ startDate: utcDay('2026-09-06') })]));

    expect(await screen.findByText('Layers')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  }, TEST_TIMEOUT);

  it('a group ending today is still Active today in US Central', async () => {
    process.env.TZ = 'America/Chicago';
    freezeClockAt('2026-09-06T00:00:00.000Z'); // 2026-09-05 19:00 local

    withProviders(
      <GroupsPage />,
      groupMocks([group({ startDate: utcDay('2026-09-01'), endDate: utcDay('2026-09-05') })])
    );

    expect(await screen.findByText('Active')).toBeInTheDocument();
  }, TEST_TIMEOUT);
});
