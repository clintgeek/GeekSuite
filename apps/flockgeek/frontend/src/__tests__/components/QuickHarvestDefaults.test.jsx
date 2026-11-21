// UX review 2026-11-18, FlockGeek 1 and 3: logging eggs took 5–7 taps and
// remembered nothing. The sheet now preselects the pen last logged on this
// device, builds its one-tap counts around the usual count at that pen, puts
// them directly under the count (they used to sit under the ÷ days caption
// and read as a days picker), and folds ÷ days into one "Covers 1 day" line.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuickHarvestEntry from '../../components/QuickHarvestEntry';
import { renderWithProviders } from '../testUtils';
import {
  LAST_PEN_KEY,
  FALLBACK_COUNTS,
  readLastPen,
  rememberPen,
  usualCounts,
} from '../../utils/harvestDefaults';

const { mockRecordEggProduction, mutationOptions, recent } = vi.hoisted(() => ({
  mockRecordEggProduction: vi.fn(),
  mutationOptions: { current: null },
  recent: { current: [] },
}));

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useQuery: (query) =>
      query.definitions[0].name.value === 'GetEggProductions'
        ? { data: { eggProductions: recent.current } }
        : { data: undefined },
    useMutation: (_doc, options) => {
      mutationOptions.current = options;
      return [mockRecordEggProduction, { loading: false }];
    },
  };
});

const PENS = [
  { id: 'north', name: 'North Coop' },
  { id: 'south', name: 'South Run' },
  { id: 'east', name: 'East Tractor' },
];
const egg = (id, date, eggsCount, locationId, daysObserved = 1) => ({ id, date, eggsCount, locationId, daysObserved });

beforeEach(() => {
  window.localStorage.clear();
  mockRecordEggProduction.mockClear();
  mutationOptions.current = null;
  recent.current = [];
});

describe('usualCounts', () => {
  it('centres five counts on the median per-day count at the pen', () => {
    const records = [
      egg('1', '2026-11-17', 9, 'north'),
      egg('2', '2026-11-16', 10, 'north'),
      egg('3', '2026-11-15', 8, 'north'),
      egg('4', '2026-11-14', 27, 'north', 3), // three days of 9
      egg('5', '2026-11-17', 2, 'south'),
    ];
    expect(usualCounts(records, 'north')).toEqual({ counts: [7, 8, 9, 10, 11], usual: 9 });
    expect(usualCounts(records, 'south')).toEqual({ counts: [1, 2, 3, 4, 5], usual: 2 });
  });

  it('falls back to the fixed row with no history', () => {
    expect(usualCounts([], 'north')).toEqual({ counts: FALLBACK_COUNTS, usual: null });
  });
});

describe('the remembered pen', () => {
  it('survives storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readLastPen()).toBe('');
    expect(() => rememberPen('north')).not.toThrow();
    spy.mockRestore();
    set.mockRestore();
  });

  it('preselects the pen last logged on this device', async () => {
    window.localStorage.setItem(LAST_PEN_KEY, 'south');
    renderWithProviders(<QuickHarvestEntry locations={PENS} />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Location / Pen' })).toHaveTextContent('South Run')
    );
  });

  it('ignores a remembered pen that no longer exists', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(LAST_PEN_KEY, 'gone');
    renderWithProviders(<QuickHarvestEntry locations={PENS} />);
    expect(screen.getByRole('combobox', { name: 'Location / Pen' })).not.toHaveTextContent(/North|South|East/);
    // The display alone proves nothing: MUI's Select shows a blank for a
    // value that matches no option too. What is submitted is the proof — a
    // deleted pen's id must never reach the gateway (review 2026-11-20).
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: /log 3 eggs/i }));
    expect(mockRecordEggProduction).toHaveBeenCalledTimes(1);
    expect(mockRecordEggProduction.mock.calls[0][0].variables).not.toHaveProperty('locationId');
  }, 30000);

  it('remembers the pen a harvest was logged to', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(LAST_PEN_KEY, 'east');
    renderWithProviders(<QuickHarvestEntry locations={PENS} />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Location / Pen' })).toHaveTextContent('East Tractor')
    );
    await user.click(screen.getByRole('combobox', { name: 'Location / Pen' }));
    await user.click(await screen.findByRole('option', { name: 'North Coop' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: /log 3 eggs/i }));
    expect(mockRecordEggProduction).toHaveBeenCalledTimes(1);
    expect(mockRecordEggProduction.mock.calls[0][0].variables.locationId).toBe('north');

    mutationOptions.current.onCompleted();
    expect(window.localStorage.getItem(LAST_PEN_KEY)).toBe('north');
  }, 30000);
});

describe('three taps for the usual morning', () => {
  it('offers the usual count at the remembered pen as one tap, then logs it', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(LAST_PEN_KEY, 'north');
    recent.current = [
      egg('1', '2026-11-17', 9, 'north'),
      egg('2', '2026-11-16', 10, 'north'),
      egg('3', '2026-11-15', 9, 'north'),
    ];
    renderWithProviders(<QuickHarvestEntry variant="sheet" locations={PENS} />);

    const counts = await screen.findByRole('group', { name: /usual count at this pen: 9/i });
    expect(counts).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '9' }));
    await user.click(screen.getByRole('button', { name: /log 9 eggs/i }));

    const [{ variables }] = mockRecordEggProduction.mock.calls[0];
    expect(variables).toEqual(expect.objectContaining({ eggsCount: 9, locationId: 'north', daysObserved: 1 }));
  }, 30000);

  it('says how many days the harvest covers in one line, with the field on demand', async () => {
    const user = userEvent.setup();
    renderWithProviders(<QuickHarvestEntry locations={[]} />);
    expect(screen.getByText('Covers 1 day')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'Days observed' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change days covered' }));
    expect(await screen.findByRole('spinbutton', { name: 'Days observed' })).toBeInTheDocument();
  });
});
