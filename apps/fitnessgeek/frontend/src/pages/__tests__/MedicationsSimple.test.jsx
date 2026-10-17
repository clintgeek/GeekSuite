/**
 * Medications, UX review 2026-10-17 L16 and L23.
 *
 *  - L16: adding a medication was a pharmacist's form. Simple now asks two
 *    things: "What's it called?" (live suggestions, RxNorm a hint not a gate)
 *    and "When do you take it?" (Morning · Midday · Evening · Bedtime · Once a
 *    day), with Save at the bottom. Simple hides export, the Rx/OTC/Supplement
 *    type and indications; both modes put export under the list, and only when
 *    there is one. Full says "What it's for", not "indications".
 *  - L23: the page's checklist was today-only; last night's missed tick
 *    couldn't be recorded. It can switch to Yesterday, and ticks there are
 *    written for yesterday's date.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render as rtlRender, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
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
const { ExperienceContext } = await import('../../contexts/ExperienceContext.jsx');

const render = ({ simple = false } = {}) => rtlRender(
  <MemoryRouter>
    <ExperienceContext.Provider value={{ isSimple: simple, effectiveMode: simple ? 'simple' : 'full' }}>
      <GeekToastProvider>
        <Medications />
      </GeekToastProvider>
    </ExperienceContext.Provider>
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

beforeEach(() => {
  vi.clearAllMocks();
  medsService.list.mockResolvedValue([]);
  medsService.search.mockResolvedValue([]);
  medsService.getDetails.mockResolvedValue({ strengths: [], suggested: [] });
  medsService.getLogsByDate.mockResolvedValue([]);
  medsService.log.mockResolvedValue({ _id: 'log' });
  medsService.save.mockImplementation(async (p) => ({ id: 'new', ...p }));
});

afterEach(() => {
  vi.useRealTimers();
});

async function openSimpleAdd() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add a medication' }));
  return screen.findByRole('textbox', { name: /What.s it called\?/ });
}

describe('L16 — Simple: the two-question add', () => {
  it('has no export, no search box, and no type or indications', async () => {
    render({ simple: true });
    const name = await openSimpleAdd();
    expect(name).toBeInTheDocument();
    expect(screen.getByText('When do you take it?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy text' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
    expect(screen.queryByLabelText(/Medication name/i)).toBeNull();
    expect(screen.queryByLabelText('Type')).toBeNull();
    expect(screen.queryByText(/indications|what it.s for/i)).toBeNull();
  });

  it('saves what she typed — no search, no pick — as one daily dose', async () => {
    render({ simple: true });
    const name = await openSimpleAdd();
    fireEvent.change(name, { target: { value: 'Fish oil' } });
    // Once a day is what nothing-picked means, and it says so.
    expect(screen.getByRole('button', { name: 'Once a day' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalled());
    expect(medsService.save.mock.calls[0][0]).toMatchObject({ display_name: 'Fish oil', rxcui: null, times_of_day: [] });
  });

  it('suggests names as she types, and a pick fills the name and keeps the rxcui', async () => {
    medsService.search.mockResolvedValue([{ rxcui: '29046', name: 'Lisinopril', score: 100 }]);
    render({ simple: true });
    const name = await openSimpleAdd();
    fireEvent.change(name, { target: { value: 'lisin' } });
    // No Search button: the suggestion arrives by itself.
    const pick = await screen.findByText('Lisinopril', {}, { timeout: 2000 });
    expect(medsService.search).toHaveBeenCalledWith('lisin');
    expect(screen.queryByText(/RxCUI/)).toBeNull();
    fireEvent.click(pick);
    await waitFor(() => expect(name).toHaveValue('Lisinopril'));
    fireEvent.click(screen.getByRole('button', { name: 'Morning' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalled());
    expect(medsService.save.mock.calls[0][0]).toMatchObject({ display_name: 'Lisinopril', rxcui: '29046', times_of_day: ['morning'] });
  });

  it('maps Midday to the afternoon slot, and Once a day clears the times', async () => {
    render({ simple: true });
    const name = await openSimpleAdd();
    fireEvent.change(name, { target: { value: 'Vitamin D' } });
    fireEvent.click(screen.getByRole('button', { name: 'Morning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Midday' }));
    expect(screen.getByRole('button', { name: 'Once a day' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Once a day' }));
    expect(screen.getByRole('button', { name: 'Morning' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Midday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bedtime' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalled());
    expect(medsService.save.mock.calls[0][0].times_of_day).toEqual(['afternoon', 'bedtime']);
  });

  it('a lookup that is down says so kindly, and the typed name still saves', async () => {
    medsService.search.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    render({ simple: true });
    const name = await openSimpleAdd();
    fireEvent.change(name, { target: { value: 'Magnesium' } });
    expect(await screen.findByText(/I can.t look names up right now/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText('Network Error')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalled());
    expect(medsService.save.mock.calls[0][0]).toMatchObject({ display_name: 'Magnesium' });
  });

  it('the list uses the same words (Midday) and no Rx/OTC chip', async () => {
    medsService.list.mockResolvedValue([{ ...MED, times_of_day: ['afternoon'] }]);
    render({ simple: true });
    expect(await screen.findByRole('button', { name: 'Edit Lisinopril' })).toBeInTheDocument();
    // The list's group and today's checklist both say Midday now (utils/medSlots.js).
    expect(screen.getAllByText('Midday').length).toBeGreaterThan(0);
    expect(screen.queryByText('Afternoon')).toBeNull();
    expect(screen.queryByText('Prescription')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy text' })).toBeNull();
  });
});

describe('L16 — Simple: editing', () => {
  it('opens the same two questions, filled in, and keeps the hidden fields', async () => {
    medsService.list.mockResolvedValue([{ ...MED, med_type: 'otc', times_of_day: ['afternoon'] }]);
    medsService.update.mockImplementation(async (id, p) => ({ id, ...p }));
    render({ simple: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Lisinopril' }));
    const name = await screen.findByRole('textbox', { name: /What.s it called\?/ });
    expect(name).toHaveValue('Lisinopril');
    expect(screen.getByRole('button', { name: 'Midday' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Evening' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.update).toHaveBeenCalled());
    expect(medsService.update.mock.calls[0][1]).toMatchObject({ med_type: 'otc', times_of_day: ['afternoon', 'evening'], user_indications: ['blood pressure'] });
  });
});

describe('a saved medicine leaves a clean form', () => {
  it("the last medicine's times don't carry into the next one (Full)", async () => {
    render();
    await screen.findByText('No medications yet');
    const addTyped = async (n) => {
      fireEvent.change(screen.getByLabelText(/Medication name/i), { target: { value: n } });
      fireEvent.click(screen.getByRole('button', { name: /^Search$/i }));
      fireEvent.click(await screen.findByRole('button', { name: `Add “${n}” as typed` }));
      await screen.findByLabelText('Display name');
    };
    await addTyped('Vitamin D');
    fireEvent.click(screen.getByRole('button', { name: 'Morning' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByLabelText('Display name')).toBeNull());
    await addTyped('Fish oil');
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalledTimes(2));
    expect(medsService.save.mock.calls[1][0]).toMatchObject({ display_name: 'Fish oil', times_of_day: [] });
   }, 30000);
});

describe('L16 — Full: export under the list, "What it\'s for"', () => {
  it('shows no export with no medications', async () => {
    render();
    await screen.findByText('No medications yet');
    expect(screen.queryByRole('button', { name: 'Copy text' })).toBeNull();
  });

  it('puts export after the list', async () => {
    medsService.list.mockResolvedValue([MED]);
    render();
    const edit = await screen.findByRole('button', { name: 'Edit Lisinopril' });
    const copy = screen.getByRole('button', { name: 'Copy text' });
    expect(edit.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the edit form says "What it\'s for", not "indications", and keeps the type', async () => {
    medsService.list.mockResolvedValue([MED]);
    medsService.getDetails.mockResolvedValue({ strengths: [], suggested: ['hypertension'] });
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Lisinopril' }));
    expect(await screen.findByText('What it’s for')).toBeInTheDocument();
    expect(screen.queryByText(/indications/i)).toBeNull();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
  });
});

describe('L23 — the checklist can tick yesterday', () => {
  it('Yesterday reads and writes yesterday, and says so in words', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 9, 0, 0));
    medsService.list.mockResolvedValue([MED]);
    render();
    await screen.findByRole('checkbox', { name: 'Lisinopril, morning' });
    expect(screen.getByText('Today’s doses')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    await waitFor(() => expect(medsService.getLogsByDate).toHaveBeenLastCalledWith('2026-10-15'));
    expect(screen.getByText('Yesterday’s doses')).toBeInTheDocument();
    expect(screen.getByText(/Showing yesterday, Oct 15/)).toBeInTheDocument();

    const box = within(screen.getByTestId('meds-checklist')).getByRole('checkbox', { name: 'Lisinopril, morning' });
    await act(async () => { fireEvent.click(box); });
    expect(medsService.log).toHaveBeenCalledWith('m1', { date: '2026-10-15', time_of_day: 'morning', taken: true });
  });

  it('Today is the default, and switching back writes today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 9, 0, 0));
    medsService.list.mockResolvedValue([MED]);
    render();
    await screen.findByRole('checkbox', { name: 'Lisinopril, morning' });
    fireEvent.click(screen.getByRole('button', { name: 'Yesterday' }));
    await waitFor(() => expect(medsService.getLogsByDate).toHaveBeenLastCalledWith('2026-10-15'));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() => expect(medsService.getLogsByDate).toHaveBeenLastCalledWith('2026-10-16'));
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Lisinopril, morning' })); });
    expect(medsService.log).toHaveBeenCalledWith('m1', { date: '2026-10-16', time_of_day: 'morning', taken: true });
  });
});
