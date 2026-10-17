/**
 * Copy a meal (UX review L3, L7, L9).
 *
 * It copied the whole day by default: one tap on "Copy Meal" added
 * yesterday's breakfast, lunch, dinner and snacks to today, with Copy in the
 * top-right corner, an ISO-date summary, an unlabelled "From" select that
 * rendered blank, and no undo. These pin the fix:
 *   - nothing copies until a source meal is chosen; "Whole day" is explicit;
 *   - "Whose log" is labelled and reads "Mine" by default;
 *   - the summary is one sentence, with the person, the days and a count;
 *   - Copy is at the bottom on a phone;
 *   - a copy ends with the standard toast, and its Undo deletes what was added.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { GeekToastProvider } from '@geeksuite/ui';

const svc = vi.hoisted(() => ({
  getHouseholdMembers: vi.fn(),
  getLogsForDate: vi.fn(),
  getHouseholdMemberLogs: vi.fn(),
  copyMeal: vi.fn(),
  deleteFoodLog: vi.fn(),
}));

vi.mock('../../../services/fitnessGeekService', () => ({
  fitnessGeekService: {
    ...svc,
    formatDate: (date) => {
      if (typeof date === 'string') return date;
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    },
  },
}));

// Friday, Oct 16 2026. Yesterday is Thursday.
const TODAY = '2026-10-16';
const THURSDAY = '2026-10-15';
vi.mock('../../../hooks/useToday.js', () => ({ useToday: () => '2026-10-16' }));

const { default: CopyMealDialog } = await import('../CopyMealDialog.jsx');

const CHEF = { user_id: 'chef', display_name: 'Chef', shares_food_logs: true };
const chefsThursday = [
  { id: 'c1', log_date: THURSDAY, meal_type: 'dinner' },
  { id: 'c2', log_date: THURSDAY, meal_type: 'dinner' },
  { id: 'c3', log_date: THURSDAY, meal_type: 'dinner' },
  { id: 'c4', log_date: THURSDAY, meal_type: 'lunch' },
];

const phone = (on) => {
  window.matchMedia = (query) => ({
    matches: on, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
};
const originalMatchMedia = window.matchMedia;

const renderDialog = (props = {}) => render(
  <GeekToastProvider>
    <CopyMealDialog open currentDate={TODAY} onClose={() => {}} onCopyComplete={() => {}} {...props} />
  </GeekToastProvider>
);

const choose = async (comboName, option) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: comboName }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
};

beforeEach(() => {
  svc.getHouseholdMembers.mockResolvedValue({ household_id: 'h1', members: [CHEF] });
  svc.getLogsForDate.mockResolvedValue([]);
  svc.getHouseholdMemberLogs.mockResolvedValue(chefsThursday);
  svc.copyMeal.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }]);
  svc.deleteFoodLog.mockResolvedValue({});
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.clearAllMocks();
});

describe('Copy a meal — no copy without a chosen meal', () => {
  it('opens with no meal chosen, and Copy does nothing until one is', async () => {
    renderDialog();
    expect(screen.getByTestId('copy-summary')).toHaveTextContent('Choose which meal to copy.');
    const copy = screen.getByRole('button', { name: /^copy$/i, hidden: true });
    expect(copy).toBeDisabled();
    fireEvent.click(copy);
    expect(svc.copyMeal).not.toHaveBeenCalled();
  });

  it('"Whole day" is an option you pick, and the summary says so', async () => {
    svc.getLogsForDate.mockResolvedValue([
      { id: 'a', log_date: THURSDAY, meal_type: 'breakfast' },
      { id: 'b', log_date: THURSDAY, meal_type: 'dinner' },
    ]);
    renderDialog();
    await choose('Which meal', 'Whole day');
    await waitFor(() => expect(screen.getByTestId('copy-summary'))
      .toHaveTextContent('Copy your whole day from Thursday into today (2 foods)'));
  });

  it('an empty source meal says so, and Copy stays off', async () => {
    renderDialog();
    await choose('Which meal', 'Dinner');
    await waitFor(() => expect(screen.getByTestId('copy-summary'))
      .toHaveTextContent('There’s nothing in your dinner on Thursday.'));
    expect(screen.getByRole('button', { name: /^copy$/i, hidden: true })).toBeDisabled();
  });
});

describe('Copy a meal — whose log, in words', () => {
  it('labels the From select "Whose log", showing "Mine" by default', async () => {
    renderDialog();
    const whose = await screen.findByRole('combobox', { name: 'Whose log' });
    expect(whose).toHaveTextContent('Mine');
  });

  it('writes the copy as a sentence: person, meal, days and how many foods', async () => {
    renderDialog();
    await screen.findByRole('combobox', { name: 'Whose log' });
    await choose('Whose log', 'Chef');
    await choose('Which meal', 'Dinner');
    await waitFor(() => expect(screen.getByTestId('copy-summary'))
      .toHaveTextContent('Copy Chef’s dinner from Thursday into today’s dinner (3 foods)'));
    expect(svc.getHouseholdMemberLogs).toHaveBeenCalledWith('chef', THURSDAY);
  });
});

describe('Copy a meal — Copy, then Undo', () => {
  it('copies the chosen meal, then the toast\'s Undo deletes exactly what was added', async () => {
    const onCopyComplete = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onCopyComplete, onClose });
    await screen.findByRole('combobox', { name: 'Whose log' });
    await choose('Whose log', 'Chef');
    await choose('Which meal', 'Dinner');
    await screen.findByText(/\(3 foods\)/);

    fireEvent.click(screen.getByRole('button', { name: /^copy$/i, hidden: true }));
    await waitFor(() => expect(svc.copyMeal).toHaveBeenCalledWith(THURSDAY, TODAY, 'dinner', null, 'chef'));
    expect(await screen.findByText('Copied to today’s dinner ✓ · 3 foods')).toBeInTheDocument();
    expect(onCopyComplete).toHaveBeenCalledWith(TODAY);
    expect(onClose).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^undo$/i, hidden: true }));
    await waitFor(() => expect(svc.deleteFoodLog).toHaveBeenCalledTimes(3));
    expect(svc.deleteFoodLog.mock.calls.map((c) => c[0])).toEqual(['n1', 'n2', 'n3']);
    expect(await screen.findByText('Undone ✓')).toBeInTheDocument();
    expect(onCopyComplete).toHaveBeenCalledTimes(2);
  });

  it('on a phone, Copy is the full-width button at the bottom', () => {
    phone(true);
    renderDialog();
    const bottom = screen.getByTestId('thumb-save');
    expect(within(bottom).getByRole('button', { name: /^copy$/i, hidden: true })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^copy$/i, hidden: true })).toHaveLength(1);
  });
});
