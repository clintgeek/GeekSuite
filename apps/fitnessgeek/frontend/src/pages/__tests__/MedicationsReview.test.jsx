/**
 * Medications, REVIEW_2026-10 B3 / B14–B16 / B18.
 *
 *  - B14: a med with no time of day saved and then matched none of the four
 *    slot groups — invisible, so it could never be edited or removed.
 *  - B15: no busy state (double-adds), no error on a failed write, and the
 *    checklist never refetched after add or remove.
 *  - B16: a med could only be added from an RxNorm hit, so supplements (and
 *    everything, when RxNorm is down) couldn't be added at all.
 *  - A failed list read said "No medications yet".
 *  - B18: one tap removed a med for good; now the toast carries Undo.
 *  - B3: a PWA resumed the next morning ticked yesterday's dose.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render as rtlRender, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GeekToastProvider } from '@geeksuite/ui';

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

const render = () => rtlRender(
  <MemoryRouter>
    <GeekToastProvider>
      <Medications />
    </GeekToastProvider>
  </MemoryRouter>
);

const MED = {
  id: 'm1',
  display_name: 'Lisinopril',
  med_type: 'rx',
  strength: '10 mg',
  rxcui: '29046',
  times_of_day: ['morning'],
  user_indications: ['blood pressure'],
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.clearAllMocks();
  medsService.list.mockResolvedValue([]);
  medsService.search.mockResolvedValue([]);
  medsService.getDetails.mockResolvedValue({ strengths: [], suggested: [] });
  medsService.getLogsByDate.mockResolvedValue([]);
  medsService.log.mockResolvedValue({ _id: 'log' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('B14 — a med with no time of day', () => {
  it('shows in a "Once a day" group, where it can be edited and removed', async () => {
    medsService.list.mockResolvedValue([{ ...MED, id: 'd1', display_name: 'Vitamin D', med_type: 'supplement', times_of_day: [] }]);
    render();
    expect(await screen.findByRole('button', { name: 'Edit Vitamin D' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Vitamin D' })).toBeInTheDocument();
    expect(screen.getByText('Once a day')).toBeInTheDocument();
  });
});

describe('a failed list read', () => {
  it("says it couldn't load, not \"No medications yet\"", async () => {
    medsService.list.mockRejectedValue(Object.assign(new Error('Request failed with status code 503'), { response: { status: 503 } }));
    render();
    expect(await screen.findByText(/Couldn.t load your medications/)).toBeInTheDocument();
    expect(screen.queryByText('No medications yet')).toBeNull();
    expect(screen.queryByText(/status code/)).toBeNull();
  });
});

async function openTypedEditor(name = 'Vitamin D') {
  fireEvent.change(screen.getByLabelText(/Medication name/i), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /^Search$/i }));
  fireEvent.click(await screen.findByRole('button', { name: `Add “${name}” as typed` }));
  await screen.findByLabelText('Display name');
}

describe('B16 — adding by typed name', () => {
  it('offers "Add as typed" when RxNorm finds nothing, and saves it with no rxcui', async () => {
    medsService.save.mockResolvedValue({ id: 'd1', display_name: 'Vitamin D', times_of_day: [] });
    render();
    await screen.findByText('No medications yet');
    await openTypedEditor();
    expect(screen.getByLabelText('Display name')).toHaveValue('Vitamin D');
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalled());
    expect(medsService.save.mock.calls[0][0]).toMatchObject({ display_name: 'Vitamin D', rxcui: null });
  });

  it('offers it too when the search is down, with a plain message', async () => {
    medsService.search.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    render();
    await screen.findByText('No medications yet');
    await openTypedEditor('Fish oil');
    expect(screen.queryByText('Network Error')).toBeNull();
  });
});

describe('B15 — saves are guarded and say when they fail', () => {
  it('Save is disabled while one is in flight, so a second tap adds nothing', async () => {
    const pending = deferred();
    medsService.save.mockReturnValue(pending.promise);
    render();
    await screen.findByText('No medications yet');
    await openTypedEditor();
    const save = screen.getByRole('button', { name: /^Save$/ });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(medsService.save).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
    await act(async () => { pending.resolve({ id: 'd1', display_name: 'Vitamin D', times_of_day: [] }); });
  });

  it('a failed save shows friendly words and never the raw server text', async () => {
    medsService.save.mockRejectedValue({ graphQLErrors: [{ message: 'E11000 duplicate key error collection: medications' }] });
    render();
    await screen.findByText('No medications yet');
    await openTypedEditor();
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByText('Couldn’t save that medication. Try again.')).toBeInTheDocument();
    expect(screen.queryByText(/E11000/)).toBeNull();
  });

  it("the checklist reloads after an add — the new med can be ticked without a reload", async () => {
    const saved = { id: 'd1', display_name: 'Vitamin D', times_of_day: [] };
    render();
    await screen.findByText('No medications yet');
    medsService.list.mockResolvedValue([saved]);
    medsService.save.mockResolvedValue(saved);
    await openTypedEditor();
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByRole('checkbox', { name: 'Vitamin D' })).toBeInTheDocument();
  });

  it('the checklist drops a removed med', async () => {
    medsService.list.mockResolvedValue([MED]);
    medsService.remove.mockResolvedValue(true);
    render();
    await screen.findByRole('checkbox', { name: 'Lisinopril, morning' });
    medsService.list.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Lisinopril' }));
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Lisinopril, morning' })).toBeNull());
  });
});

describe('B18 — remove has Undo', () => {
  it('says "Removed Lisinopril" with Undo, and Undo re-creates it from the row', async () => {
    medsService.list.mockResolvedValue([MED]);
    medsService.remove.mockResolvedValue(true);
    medsService.save.mockResolvedValue({ ...MED, id: 'm2' });
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Lisinopril' }));
    expect(await screen.findByText('Removed Lisinopril')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalled());
    const input = medsService.save.mock.calls[0][0];
    expect(input).toMatchObject({ display_name: 'Lisinopril', strength: '10 mg', rxcui: '29046', times_of_day: ['morning'], user_indications: ['blood pressure'] });
    expect(input).not.toHaveProperty('id');
    expect(await screen.findByRole('button', { name: 'Edit Lisinopril' })).toBeInTheDocument();
  });

  it('a remove that failed keeps the row and says so — no "Removed"', async () => {
    medsService.list.mockResolvedValue([MED]);
    medsService.remove.mockRejectedValue(new Error('Medication was not removed'));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Lisinopril' }));
    expect(await screen.findByText('Couldn’t remove that. Try again.')).toBeInTheDocument();
    expect(screen.queryByText('Removed Lisinopril')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove Lisinopril' })).toBeInTheDocument();
  });
});

describe('B3 — a resumed PWA ticks today', () => {
  it('after the app comes back the next morning, a tick writes the new day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 22, 0, 0));
    medsService.list.mockResolvedValue([MED]);
    render();
    await screen.findByRole('checkbox', { name: 'Lisinopril, morning' });

    vi.setSystemTime(new Date(2026, 9, 16, 7, 30, 0));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });

    await waitFor(() => expect(medsService.getLogsByDate).toHaveBeenLastCalledWith('2026-10-16'));
    const box = await screen.findByRole('checkbox', { name: 'Lisinopril, morning' });
    await act(async () => { fireEvent.click(box); });
    expect(medsService.log).toHaveBeenCalledWith('m1', { date: '2026-10-16', time_of_day: 'morning', taken: true });
  });
});
