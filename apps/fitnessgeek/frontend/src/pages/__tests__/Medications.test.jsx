/**
 * The Medications page against `medsService`'s actual return contract.
 *
 * `medsService` unwraps the transport envelope — `list()`, `search()` and
 * `getDetails()` resolve to the payload itself, not `{ data: payload }` (see
 * its `unwrap()`). This page kept reading `.data` off those results, so:
 *
 *   - `setMyMeds(r.data || [])`      → the list was ALWAYS empty
 *   - `setResults(r.data || [])`     → search NEVER showed a result
 *   - `setDetails(d.data || {...})`  → strengths and suggested indications
 *                                       never loaded
 *   - `r.data.id` after a save       → TypeError on the saved row
 *
 * The layering drifted in `cf3254c`, which moved medsService from returning the
 * raw apiService envelope to unwrapping it; the page was never updated.
 *
 * Also pinned here: BURN_REVIEW P2 (f) — `supply_start_date` is a CALENDAR date
 * at UTC midnight, and "days left" was computed by differencing it against a
 * raw local `new Date()`, so the count ticked down at 19:00 Central rather than
 * at the user's own midnight.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

process.env.TZ = 'America/Chicago';

vi.mock('../../services/medsService.js', () => {
  const medsService = {
    list: vi.fn(),
    search: vi.fn(),
    getDetails: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    log: vi.fn(),
    getLogsByDate: vi.fn(),
    getById: vi.fn(),
  };
  return { medsService, default: medsService };
});

const { default: medsService } = await import('../../services/medsService.js');
const { default: Medications } = await import('../Medications.jsx');

const MED = {
  id: 'm1',
  display_name: 'Lisinopril',
  med_type: 'rx',
  strength: '10 mg',
  times_of_day: ['morning'],
  user_indications: [],
};

beforeEach(() => {
  medsService.list.mockResolvedValue([]);
  medsService.search.mockResolvedValue([]);
  medsService.getDetails.mockResolvedValue({ strengths: [], suggested: [] });
});

describe('the medication list', () => {
  it('renders the array medsService.list() resolves to', async () => {
    medsService.list.mockResolvedValue([MED]);

    render(<Medications />);

    expect(await screen.findByText('Lisinopril')).toBeInTheDocument();
    expect(screen.queryByText('No medications yet')).toBeNull();
  });

  it('shows the empty state only when there really are none', async () => {
    medsService.list.mockResolvedValue([]);

    render(<Medications />);

    expect(await screen.findByText('No medications yet')).toBeInTheDocument();
  });
});

describe('the medication search', () => {
  it('renders the candidates medsService.search() resolves to', async () => {
    render(<Medications />);
    await screen.findByText('No medications yet');

    medsService.search.mockResolvedValue([{ rxcui: '29046', name: 'Lisinopril', score: 100 }]);

    fireEvent.change(screen.getByLabelText(/Search medication/i), { target: { value: 'lisin' } });
    fireEvent.click(screen.getByRole('button', { name: /^Search$/i }));

    expect(await screen.findByText('Lisinopril')).toBeInTheDocument();
  });
});

describe('days of supply is counted in whole calendar days', () => {
  it('a supply started 3 calendar days ago on a 30-day script reads 27 days left', async () => {
    // Build "3 local days ago" and store it the way the API does: the calendar
    // day at UTC midnight. Under the old local-vs-UTC subtraction the count
    // came out one short for most of the evening in Central.
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const startedUtcMidnight = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00.000Z`;

    medsService.list.mockResolvedValue([
      { ...MED, supply_start_date: startedUtcMidnight, days_supply: 30 },
    ]);

    render(<Medications />);

    await waitFor(() => expect(screen.getByText('27 days left')).toBeInTheDocument());
  });

  it('a supply started today reads the full script', async () => {
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const todayUtcMidnight = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00:00.000Z`;

    medsService.list.mockResolvedValue([
      { ...MED, supply_start_date: todayUtcMidnight, days_supply: 30 },
    ]);

    render(<Medications />);

    await waitFor(() => expect(screen.getByText('30 days left')).toBeInTheDocument());
  });
});
