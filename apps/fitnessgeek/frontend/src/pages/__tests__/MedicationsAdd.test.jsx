/**
 * Medications, UX review 2026-10-17 L16 and L23, as the one page.
 *
 *  - L16: adding a medication was a pharmacist's form. One dialog now asks
 *    "What's it called?" (live suggestions, RxNorm a hint not a gate) and
 *    "When do you take it?" (Morning · Midday · Evening · Bedtime · Once a day),
 *    with Save at the bottom. Strength, type and "What it's for" sit behind
 *    "More details" in the same dialog. Export goes under the list, and only
 *    when there is one.
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

async function openAdd() {
  fireEvent.click(await screen.findByRole('button', { name: 'Add a medication' }));
  return screen.findByRole('textbox', { name: /What.s it called\?/ });
}

const openMore = () => fireEvent.click(screen.getByRole('button', { name: 'More details' }));

describe('L16 — the one add dialog', () => {
  it('asks two things first, keeps the extras behind More details, and has no search box', async () => {
    render();
    const name = await openAdd();
    expect(name).toBeInTheDocument();
    expect(screen.getByText('When do you take it?')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Medication name/i)).toBeNull();
    // Not needed to save, so not in the way until asked for.
    expect(screen.getByRole('button', { name: 'More details' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Type')).toBeNull();
    expect(screen.queryByText('What it’s for')).toBeNull();
    openMore();
    expect(await screen.findByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByText('What it’s for')).toBeInTheDocument();
    expect(screen.queryByText(/indications/i)).toBeNull();
  });

  it('More details saves the type and what it is for, with the rest', async () => {
    render();
    const name = await openAdd();
    fireEvent.change(name, { target: { value: 'Fish oil' } });
    openMore();
    fireEvent.mouseDown(await screen.findByLabelText('Type'));
    fireEvent.click(await screen.findByRole('option', { name: 'Supplement' }));
    fireEvent.change(screen.getByLabelText('Add what it’s for'), { target: { value: 'heart' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalled());
    expect(medsService.save.mock.calls[0][0]).toMatchObject({ display_name: 'Fish oil', med_type: 'supplement', user_indications: ['heart'], times_of_day: [] });
  });

  it('a picked suggestion brings its strengths and suggested uses into More details', async () => {
    medsService.search.mockResolvedValue([{ rxcui: '29046', name: 'Lisinopril', score: 100 }]);
    medsService.getDetails.mockResolvedValue({
      ingredient: { name: 'lisinopril' },
      strengths: [{ rxcui: 's10', name: '10 mg' }],
      suggested: ['hypertension'],
    });
    render();
    const name = await openAdd();
    fireEvent.change(name, { target: { value: 'lisin' } });
    fireEvent.click(await screen.findByText('Lisinopril', {}, { timeout: 2000 }));
    // It opens itself when there is something in it.
    fireEvent.mouseDown(await screen.findByLabelText('Strength'));
    fireEvent.click(await screen.findByRole('option', { name: '10 mg' }));
    // The suggestion chip, and the same use already kept under What it's for.
    expect(screen.getAllByRole('button', { name: 'hypertension' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalled());
    expect(medsService.save.mock.calls[0][0]).toMatchObject({
      display_name: 'Lisinopril', rxcui: '29046', ingredient_name: 'lisinopril', strength: '10 mg',
      suggested_indications: ['hypertension'], user_indications: ['hypertension'],
    });
  });

  it('saves what she typed — no search, no pick — as one daily dose', async () => {
    render();
    const name = await openAdd();
    fireEvent.change(name, { target: { value: 'Fish oil' } });
    // Nothing picked means once a day, and it says so in words (no fifth button).
    expect(screen.getByTestId('med-when-hint')).toHaveTextContent('No set time? Leave these off and it’s once a day.');
    expect(screen.queryByRole('button', { name: 'Once a day' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalled());
    expect(medsService.save.mock.calls[0][0]).toMatchObject({ display_name: 'Fish oil', rxcui: null, times_of_day: [] });
  });

  it('suggests names as she types, and a pick fills the name and keeps the rxcui', async () => {
    medsService.search.mockResolvedValue([{ rxcui: '29046', name: 'Lisinopril', score: 100 }]);
    render();
    const name = await openAdd();
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

  it('maps Midday to the afternoon slot, and a time taps off again', async () => {
    render();
    const name = await openAdd();
    fireEvent.change(name, { target: { value: 'Vitamin D' } });
    fireEvent.click(screen.getByRole('button', { name: 'Morning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Midday' }));
    expect(screen.getByTestId('med-when-hint')).toHaveTextContent('You’ll tick it 2 times a day.');
    fireEvent.click(screen.getByRole('button', { name: 'Morning' }));
    expect(screen.getByRole('button', { name: 'Morning' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Bedtime' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalled());
    expect(medsService.save.mock.calls[0][0].times_of_day).toEqual(['afternoon', 'bedtime']);
  });

  it('a lookup that is down says so kindly, and the typed name still saves', async () => {
    medsService.search.mockRejectedValue(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }));
    render();
    const name = await openAdd();
    fireEvent.change(name, { target: { value: 'Magnesium' } });
    expect(await screen.findByText(/I can.t look names up right now/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText('Network Error')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalled());
    expect(medsService.save.mock.calls[0][0]).toMatchObject({ display_name: 'Magnesium' });
  });

  it('the list uses the same words (Midday), with the type as a quiet line, and offers export', async () => {
    medsService.list.mockResolvedValue([{ ...MED, times_of_day: ['afternoon'] }]);
    render();
    expect(await screen.findByRole('button', { name: 'Edit Lisinopril' })).toBeInTheDocument();
    // The list's group and today's checklist both say Midday now (utils/medSlots.js).
    expect(screen.getAllByText('Midday').length).toBeGreaterThan(0);
    expect(screen.queryByText('Afternoon')).toBeNull();
    expect(screen.getByText('Prescription')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy text' })).toBeInTheDocument();
  });
});

describe('L16 — editing', () => {
  it('opens the same dialog, filled in, with its details open and kept', async () => {
    medsService.list.mockResolvedValue([{ ...MED, med_type: 'otc', times_of_day: ['afternoon'] }]);
    medsService.update.mockImplementation(async (id, p) => ({ id, ...p }));
    render();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Lisinopril' }));
    const name = await screen.findByRole('textbox', { name: /What.s it called\?/ });
    expect(name).toHaveValue('Lisinopril');
    expect(screen.getByRole('button', { name: 'Midday' })).toHaveAttribute('aria-pressed', 'true');
    // Not the default type, and it has uses: the details are already open.
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'blood pressure' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Evening' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.update).toHaveBeenCalled());
    expect(medsService.update.mock.calls[0][1]).toMatchObject({ med_type: 'otc', times_of_day: ['afternoon', 'evening'], user_indications: ['blood pressure'] });
  });
});

describe('a saved medicine leaves a clean form', () => {
  it("the last medicine's times don't carry into the next one", async () => {
    render();
    await screen.findByText('No medications yet');
    const addTyped = async (n) => {
      fireEvent.click(await screen.findByRole('button', { name: 'Add a medication' }));
      fireEvent.change(await screen.findByRole('textbox', { name: /What.s it called\?/ }), { target: { value: n } });
    };
    await addTyped('Vitamin D');
    fireEvent.click(screen.getByRole('button', { name: 'Morning' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /What.s it called\?/ })).toBeNull());
    await addTyped('Fish oil');
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(medsService.save).toHaveBeenCalledTimes(2));
    expect(medsService.save.mock.calls[1][0]).toMatchObject({ display_name: 'Fish oil', times_of_day: [] });
   }, 30000);
});

describe('L16 — export under the list', () => {
  it('shows no export with no medications', async () => {
    render();
    await screen.findByText('No medications yet');
    expect(screen.queryByRole('button', { name: 'Copy text' })).toBeNull();
  });

  it('puts export after the list', async () => {
    medsService.list.mockResolvedValue([MED]);
    render();
    const edit = await screen.findByRole('button', { name: 'Edit Lisinopril' });
    for (const name of ['Copy text', 'Download .txt', 'Download PDF']) {
      const btn = screen.getByRole('button', { name });
      expect(edit.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('puts the one filled Add button above the list, and the empty state offers it too', async () => {
    medsService.list.mockResolvedValue([MED]);
    const { unmount } = render();
    const add = await screen.findByRole('button', { name: 'Add a medication' });
    const edit = screen.getByRole('button', { name: 'Edit Lisinopril' });
    expect(add.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    medsService.list.mockResolvedValue([]);
    render();
    expect(await screen.findByRole('button', { name: 'Add a medication' })).toBeInTheDocument();
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

describe('drug names read like a person wrote them', () => {
  it('tidies the database form', async () => {
    const { tidyDrugName } = await import('../Medications.jsx');
    expect(tidyDrugName('Lisinopril 10 MG Oral Tablet')).toBe('Lisinopril 10 mg tablet');
    expect(tidyDrugName('Metformin 500 MG Extended Release Oral Tablet')).toBe('Metformin 500 mg extended release tablet');
    expect(tidyDrugName('Vitamin D')).toBe('Vitamin D');
  });
});
