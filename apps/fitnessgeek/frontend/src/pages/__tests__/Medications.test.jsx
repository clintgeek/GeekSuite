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
 * Refill tracking (days supply / days left) was removed on 2026-09-27; the tests
 * below pin that it stays gone.
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

    // Once in the list, once as today's dose to tick (SIMPLE_AND_FULL_PLAN.md item 6).
    expect(await screen.findAllByText('Lisinopril')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Lisinopril, morning' })).toBeInTheDocument();
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

describe('refill tracking is gone (Chef, 2026-09-27)', () => {
  // "just too complicated to keep updated and the mail order places do it
  // automatically anyway." A stored supply must not resurface anywhere.
  const SUPPLIED = { ...MED, supply_start_date: new Date().toISOString(), days_supply: 30 };

  it('shows no days-left chip or low-supply warning, even for a med with a stored supply', async () => {
    medsService.list.mockResolvedValue([{ ...SUPPLIED, days_supply: 3 }]);
    render(<Medications />);
    await screen.findAllByText('Lisinopril');
    expect(screen.queryByText(/days left/i)).toBeNull();
  });

  it('the edit form has no days-supply field, and a save sends no supply keys', async () => {
    medsService.list.mockResolvedValue([SUPPLIED]);
    medsService.update.mockResolvedValue(SUPPLIED);
    render(<Medications />);
    await screen.findAllByText('Lisinopril');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lisinopril' }));
    await waitFor(() => expect(screen.queryByLabelText(/days supply/i)).toBeNull());
    fireEvent.click(await screen.findByRole('button', { name: /^(update|save)/i }));
    await waitFor(() => expect(medsService.update).toHaveBeenCalled());
    const payload = medsService.update.mock.calls[0][1];
    expect(payload).not.toHaveProperty('days_supply');
    expect(payload).not.toHaveProperty('supply_start_date');
  });
});
