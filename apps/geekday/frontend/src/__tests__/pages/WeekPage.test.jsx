// The week spread (DOCS/GEEKDAY_SPEC.md §6). Runs in America/Chicago (vitest.config.js).
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { GeekToastProvider } from '@geeksuite/ui';
import DayHeader from '../../components/DayHeader.jsx';
import { DayCell } from '../../components/week/WeekCell.jsx';
import { FIND_WEEK_DAY_NOTE, GET_UNSCHEDULED_TASKS, GET_WEEK_TASKS, MOVE_DAY_TASK, SET_DAY_TASK_STATUS } from '../../graphql/documents.js';
import { weekKeys } from '../../lib/days.js';
import { groupWeek } from '../../lib/week.js';
import WeekPage from '../../pages/WeekPage.jsx';
import { dateOnly, makeTask, renderDay } from '../helpers.jsx';

const TODAY = '2026-11-20'; // Friday
const MONDAY = '2026-11-16';
const KEYS = weekKeys(TODAY);
const CST = 360;

const VET = makeTask({ id: 'vet', content: 'Call the vet', dueDate: '2026-11-19T20:00:00.000Z', hasDueTime: true }); // Thu 2:00 PM
const PELLETS = makeTask({ id: 'pellets', content: 'Buy layer pellets', dueDate: dateOnly('2026-11-19') });
const WEEK = [
  PELLETS,
  VET,
  makeTask({ id: 'latch', content: 'Fix the latch', dueDate: dateOnly('2026-11-17') }), // unfinished, Tuesday has passed
  makeTask({ id: 'eggs', content: 'Collect eggs', dueDate: dateOnly(TODAY), status: 'completed', completedAt: '2026-11-20T13:00:00.000Z' }),
  makeTask({ id: 'bread', content: 'Start the sourdough', dueDate: dateOnly(TODAY) }),
  makeTask({ id: 'virtual_s1_1', content: 'Water the starts', dueDate: dateOnly('2026-11-21'), seriesId: 's1', recurrenceRule: 'FREQ=WEEKLY' }),
];
const WAITING = [
  makeTask({ id: 'bill', content: 'Pay the feed bill', dueDate: dateOnly('2026-11-10') }),
  makeTask({ id: 'someday', content: 'Order seed catalogues' }),
  // `dailyTasks(today)` repeats what the week's list already has.
  makeTask({ id: 'bread', content: 'Start the sourdough', dueDate: dateOnly(TODAY) }),
];

const INK = JSON.stringify({
  document: {
    store: {
      'shape:a': { id: 'shape:a', typeName: 'shape', type: 'draw', x: 100, y: 100, rotation: 0, props: { segments: [{ type: 'free', points: [{ x: 0, y: 0 }, { x: 50, y: 20 }] }] } },
    },
    schema: {},
  },
});

const always = { maxUsageCount: Number.POSITIVE_INFINITY };
const weekMock = (list = WEEK, monday = MONDAY) => ({
  request: { query: GET_WEEK_TASKS, variables: { date: monday, tzOffsetMinutes: CST } },
  result: { data: { weeklyTasks: list } },
  ...always,
});
const waitingMock = (list = WAITING) => ({
  request: { query: GET_UNSCHEDULED_TASKS, variables: { date: TODAY, tzOffsetMinutes: CST } },
  result: { data: { dailyTasks: list } },
  ...always,
});
/** Tuesday has an ink page; the other days have none. */
const noteMocks = (keys = KEYS) =>
  keys.map((key) => ({
    request: { query: FIND_WEEK_DAY_NOTE, variables: { tag: `daily/${key}` } },
    result: {
      data: {
        notes:
          key === '2026-11-17'
            ? [{ __typename: 'Note', id: 'n-tue', content: INK, archived: false, deletedAt: null, createdAt: '2026-11-17T15:00:00.000Z' }]
            : [],
      },
    },
    ...always,
  }));
const moveMock = (id, input, saved) => ({
  request: { query: MOVE_DAY_TASK, variables: { id, input } },
  result: vi.fn(() => ({ data: { updateTask: saved } })),
});

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

function open(mocks, path = '/week') {
  return renderDay(
    <MemoryRouter initialEntries={[path]}>
      <GeekToastProvider>
        <Routes>
          <Route path="/week" element={<WeekPage />} />
          <Route path="/week/:dayKey" element={<WeekPage />} />
          <Route path="*" element={<div data-testid="day-page-stub" />} />
        </Routes>
        <Where />
      </GeekToastProvider>
    </MemoryRouter>,
    { mocks }
  );
}

const ready = () => waitFor(() => expect(screen.getByTestId('week-page')).toHaveAttribute('data-status', 'ready'));
const cell = (key) => document.querySelector(`[data-testid="week-day"][data-day="${key}"]`);
const rowsIn = (node) => [...node.querySelectorAll('[data-testid="week-task"]')].map((row) => row.textContent);
const unscheduled = () => screen.getByTestId('week-unscheduled');

beforeEach(() => {
  // Only the clock is faked: the page must believe it is Friday the 20th.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 20, 9, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the week spread', () => {
  it('shows the seven days, Monday to Sunday, with their dates, counts and tasks, and marks today (W1, W7)', async () => {
    open([weekMock(), waitingMock(), ...noteMocks()]);
    await ready();

    expect(screen.getByTestId('week-title')).toHaveTextContent('Nov 16 – 22');
    expect(screen.getByTestId('week-relative')).toHaveTextContent('This week');
    const days = screen.getAllByTestId('week-day');
    expect(days.map((d) => d.dataset.day)).toEqual(KEYS);
    expect(within(days[0]).getByRole('heading')).toHaveTextContent('16Monday');
    expect(within(days[6]).getByRole('heading')).toHaveTextContent('22Sunday');

    // Thursday: the timed task first, with its time, then the untimed one.
    expect(rowsIn(cell('2026-11-19'))).toEqual(['2:00 PMCall the vet', 'Buy layer pellets']);
    expect(within(cell('2026-11-19')).getByTestId('week-count')).toHaveTextContent('2 to do');
    // Friday: the open task, then the done one struck through; the count is open tasks only.
    expect(rowsIn(cell(TODAY))).toEqual(['Start the sourdough', 'Collect eggs']);
    expect(within(cell(TODAY)).getByTestId('week-count')).toHaveTextContent('1 to do');
    expect(within(cell(TODAY)).getByText('Collect eggs')).toHaveStyle({ textDecoration: 'line-through' });
    expect(within(cell('2026-11-16')).getByTestId('week-count')).toHaveTextContent('all clear');

    expect(days.filter((d) => d.dataset.today === 'true').map((d) => d.dataset.day)).toEqual([TODAY]);
    expect(within(cell(TODAY)).getByTestId('week-today-mark')).toBeInTheDocument();
  });

  it('shows a picture of a day’s ink page only for a day that has one (W1)', async () => {
    open([weekMock(), waitingMock(), ...noteMocks()]);
    await ready();
    const link = await screen.findByRole('link', { name: 'Open Tuesday’s page' });
    expect(link).toHaveAttribute('href', '/day/2026-11-17');
    const svg = within(link).getByTestId('week-ink-thumb');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelector('path')).toHaveAttribute('d', 'M100 100L150 120');
    expect(screen.getAllByTestId('week-day-ink')).toHaveLength(1);
  });

  it('a failed picture read costs the picture, not the week', async () => {
    const failing = KEYS.map((key) => ({ request: { query: FIND_WEEK_DAY_NOTE, variables: { tag: `daily/${key}` } }, error: new Error('down'), ...always }));
    open([weekMock(), waitingMock(), ...failing]);
    await ready();
    expect(rowsIn(cell('2026-11-19'))).toHaveLength(2);
    expect(screen.queryByTestId('week-ink-thumb')).not.toBeInTheDocument();
    expect(screen.queryByTestId('week-error')).not.toBeInTheDocument();
  });

  it('lists overdue and undated tasks in the eighth cell, each task once (W3)', async () => {
    open([weekMock(), waitingMock(), ...noteMocks()]);
    await ready();
    expect(within(unscheduled()).getByRole('heading')).toHaveTextContent('Not scheduled');
    expect(rowsIn(unscheduled())).toEqual(['Tue, Nov 10Pay the feed bill', 'Order seed catalogues']);
    expect(within(unscheduled()).getByTestId('week-count')).toHaveTextContent('2 to do');
    expect(within(unscheduled()).getByText('Pay the feed bill').closest('li')).toHaveAttribute('data-task-tone', 'overdue');
    // Unfinished on a day of this week that has passed: in that day's cell, not here as well.
    expect(rowsIn(cell('2026-11-17'))).toEqual(['Fix the latch']);
    expect(screen.getAllByText('Start the sourdough')).toHaveLength(1);
  });

  it('moves a timed task from its menu and keeps its clock time (W4)', async () => {
    const input = { dueDate: '2026-11-21T20:00:00.000Z', hasDueTime: true }; // Saturday, still 2:00 PM Central
    const move = moveMock('vet', input, { ...VET, ...input });
    open([weekMock(), waitingMock(), ...noteMocks(), move]);
    await ready();

    await userEvent.click(screen.getByRole('button', { name: 'Move “Call the vet” to…' }));
    const menu = screen.getByRole('menu', { name: 'Move “Call the vet” to' });
    expect(within(menu).getAllByTestId('week-move-to').map((i) => i.dataset.day)).toEqual(KEYS);
    // The day it is already on cannot be picked.
    expect(within(menu).getByRole('menuitem', { name: /Thursday/ })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Saturday/ }));

    await waitFor(() => expect(move.result).toHaveBeenCalledTimes(1));
    expect(rowsIn(cell('2026-11-21'))).toContain('2:00 PMCall the vet');
    expect(rowsIn(cell('2026-11-19'))).toEqual(['Buy layer pellets']);
    expect(await screen.findByText('Moved to tomorrow.')).toBeInTheDocument();
  });

  it('moves a date-only task as a date, and Undo puts it back (W4)', async () => {
    const move = moveMock('pellets', { dueDate: '2026-11-21', hasDueTime: false }, { ...PELLETS, dueDate: dateOnly('2026-11-21') });
    const undo = moveMock('pellets', { dueDate: dateOnly('2026-11-19'), hasDueTime: false }, PELLETS);
    open([weekMock(), waitingMock(), ...noteMocks(), move, undo]);
    await ready();

    await userEvent.click(screen.getByRole('button', { name: 'Move “Buy layer pellets” to…' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Saturday/ }));
    await waitFor(() => expect(move.result).toHaveBeenCalledTimes(1));
    expect(rowsIn(cell('2026-11-21'))).toContain('Buy layer pellets');

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(undo.result).toHaveBeenCalledTimes(1));
    expect(rowsIn(cell('2026-11-19'))).toContain('Buy layer pellets');
    expect(rowsIn(cell('2026-11-21'))).not.toContain('Buy layer pellets');
  });

  it('"Next week" keeps the weekday; an unscheduled task goes to next Monday (W4)', async () => {
    const move = moveMock('pellets', { dueDate: '2026-11-26', hasDueTime: false }, { ...PELLETS, dueDate: dateOnly('2026-11-26') });
    const give = moveMock('someday', { dueDate: '2026-11-23', hasDueTime: false }, { ...WAITING[1], dueDate: dateOnly('2026-11-23') });
    open([weekMock(), waitingMock(), ...noteMocks(), move, give]);
    await ready();

    await userEvent.click(screen.getByRole('button', { name: 'Move “Buy layer pellets” to…' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Next week/ }));
    await waitFor(() => expect(move.result).toHaveBeenCalledTimes(1));
    // It has left the week on screen.
    await waitFor(() => expect(screen.queryByText('Buy layer pellets')).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Move “Order seed catalogues” to…' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Next week/ }));
    await waitFor(() => expect(give.result).toHaveBeenCalledTimes(1));
  });

  it('a refused move puts the task back and says so (W4)', async () => {
    const refused = { request: { query: MOVE_DAY_TASK, variables: { id: 'pellets', input: { dueDate: '2026-11-21', hasDueTime: false } } }, error: new Error('down') };
    open([weekMock(), waitingMock(), ...noteMocks(), refused]);
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Move “Buy layer pellets” to…' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Saturday/ }));
    expect(await screen.findByText('Couldn’t move that task. Nothing was changed.')).toBeInTheDocument();
    expect(rowsIn(cell('2026-11-19'))).toContain('Buy layer pellets');
    expect(rowsIn(cell('2026-11-21'))).not.toContain('Buy layer pellets');
  });

  it('ticks a task, and adopts the new id a repeating task’s occurrence answers with (W5)', async () => {
    const tick = {
      request: { query: SET_DAY_TASK_STATUS, variables: { id: 'bread', status: 'completed' } },
      result: vi.fn(() => ({ data: { updateTaskStatus: { ...WEEK[4], status: 'completed', completedAt: '2026-11-20T15:00:00.000Z' } } })),
    };
    const tickSeries = {
      request: { query: SET_DAY_TASK_STATUS, variables: { id: 'virtual_s1_1', status: 'completed' } },
      result: vi.fn(() => ({ data: { updateTaskStatus: { ...WEEK[5], id: 'real-1', status: 'completed', completedAt: '2026-11-20T15:00:00.000Z' } } })),
    };
    open([weekMock(), waitingMock(), ...noteMocks(), tick, tickSeries]);
    await ready();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Start the sourdough" done' }));
    await waitFor(() => expect(tick.result).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('checkbox', { name: 'Mark "Start the sourdough" not done' })).toBeChecked();
    expect(within(cell(TODAY)).getByTestId('week-count')).toHaveTextContent('all clear');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Water the starts" done' }));
    await waitFor(() => expect(tickSeries.result).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Water the starts').closest('li')).toHaveAttribute('data-task-id', 'real-1'));
    expect(screen.getByText('Water the starts').closest('li')).toHaveAttribute('data-task-state', 'done');
  });

  it('a refused tick is undone and said (W5)', async () => {
    const refused = { request: { query: SET_DAY_TASK_STATUS, variables: { id: 'bread', status: 'completed' } }, error: new Error('down') };
    open([weekMock(), waitingMock(), ...noteMocks(), refused]);
    await ready();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Start the sourdough" done' }));
    expect(await screen.findByText('Couldn’t tick that off. Nothing was changed.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark "Start the sourdough" done' })).not.toBeChecked();
  });

  it('a day’s heading opens that day’s page; today’s opens "/" (W6)', async () => {
    open([weekMock(), waitingMock(), ...noteMocks()]);
    await ready();
    expect(screen.getByRole('link', { name: 'Open Tuesday, November 17' })).toHaveAttribute('href', '/day/2026-11-17');
    expect(screen.getByRole('link', { name: 'Open Friday, November 20, today' })).toHaveAttribute('href', '/');
    await userEvent.click(screen.getByRole('link', { name: 'Open Tuesday, November 17' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/day/2026-11-17');
  });

  it('goes to other weeks by button and arrow key, and back to this week in one action (W7)', async () => {
    const nextKeys = weekKeys('2026-11-23');
    open([weekMock(), waitingMock(), ...noteMocks(), weekMock([], '2026-11-23'), ...noteMocks(nextKeys)]);
    await ready();
    expect(screen.queryByTestId('week-this')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/week/2026-11-23');
    expect(screen.getByTestId('week-title')).toHaveTextContent('Nov 23 – 29');
    expect(screen.getByTestId('week-relative')).toHaveTextContent('Next week');
    await ready();
    expect(screen.queryByTestId('week-today-mark')).not.toBeInTheDocument();
    // The eighth cell is still measured from today, not from the week on screen.
    expect(rowsIn(unscheduled())).toEqual(['Tue, Nov 10Pay the feed bill', 'Order seed catalogues']);

    await userEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/week$/);

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByTestId('where')).toHaveTextContent('/week/2026-11-23');
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/week$/);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByTestId('where')).toHaveTextContent('/week/2026-11-09');
  });

  it('a finger swipe turns the week, but not one that starts on a task (W7)', async () => {
    open([weekMock(), waitingMock(), ...noteMocks()]);
    await ready();
    const swipe = (target) => {
      fireEvent.pointerDown(target, { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: 400, clientY: 300 });
      fireEvent.pointerUp(target, { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: 200, clientY: 310 });
    };
    swipe(screen.getByTestId('week-title'));
    expect(screen.getByTestId('where')).toHaveTextContent('/week/2026-11-23');
  });

  it('opens the week a day falls in, and sends a bad key to this week', async () => {
    open([weekMock([], '2026-12-28'), waitingMock(), ...noteMocks(weekKeys('2026-12-31'))], '/week/2026-12-31');
    expect(screen.getByTestId('week-title')).toHaveTextContent('Dec 28, 2026 – Jan 3, 2027');
    expect(screen.getAllByTestId('week-day').map((d) => d.dataset.day)[4]).toBe('2027-01-01');
  });

  it('redirects an invalid week key to /week', async () => {
    open([weekMock(), waitingMock(), ...noteMocks()], '/week/2026-02-31');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/week$/));
    expect(screen.getByTestId('week-title')).toHaveTextContent('Nov 16 – 22');
  });

  it('returns to the day page: by the Day button, by "d", and to the day it came from (W8)', async () => {
    open([weekMock(), waitingMock(), ...noteMocks()]);
    await ready();
    expect(screen.getByRole('link', { name: 'Day' })).toHaveAttribute('href', '/');
    fireEvent.keyDown(window, { key: 'd' });
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
  });

  it('the Day button goes back to the day the week was opened from (W8)', async () => {
    renderDay(
      <MemoryRouter initialEntries={[{ pathname: '/week', state: { fromDay: '2026-11-18' } }]}>
        <GeekToastProvider>
          <Routes>
            <Route path="/week" element={<WeekPage />} />
          </Routes>
        </GeekToastProvider>
      </MemoryRouter>,
      { mocks: [weekMock(), waitingMock(), ...noteMocks()] }
    );
    expect(screen.getByRole('link', { name: 'Day' })).toHaveAttribute('href', '/day/2026-11-18');
  });

  it('a failed load is an error with Retry, never an empty week (W9)', async () => {
    const down = { request: { query: GET_WEEK_TASKS, variables: { date: MONDAY, tzOffsetMinutes: CST } }, error: new Error('down') };
    open([down, waitingMock(), weekMock(), ...noteMocks()]);
    expect(await screen.findByTestId('week-error')).toBeInTheDocument();
    expect(screen.queryByTestId('week-day')).not.toBeInTheDocument();
    expect(screen.queryByTestId('week-count')).not.toBeInTheDocument();
    expect(screen.queryByText(/all clear/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('week-unscheduled-empty')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await ready();
    expect(rowsIn(cell('2026-11-19'))).toHaveLength(2);
  });

  it('half an answer is a failed load too: the week without today’s list is not shown (W9)', async () => {
    const down = { request: { query: GET_UNSCHEDULED_TASKS, variables: { date: TODAY, tzOffsetMinutes: CST } }, error: new Error('down'), ...always };
    open([weekMock(), down, ...noteMocks()]);
    expect(await screen.findByTestId('week-error')).toBeInTheDocument();
    expect(screen.queryByTestId('week-day')).not.toBeInTheDocument();
  });

  it('a failed re-read keeps the week on screen and says it may be out of date (W9)', async () => {
    const once = { request: { query: GET_WEEK_TASKS, variables: { date: MONDAY, tzOffsetMinutes: CST } }, result: { data: { weeklyTasks: WEEK } } };
    const thenDown = { request: { query: GET_WEEK_TASKS, variables: { date: MONDAY, tzOffsetMinutes: CST } }, error: new Error('down'), ...always };
    open([once, thenDown, waitingMock(), ...noteMocks()]);
    await ready();
    // The connection comes back a minute later: the page re-reads.
    vi.setSystemTime(new Date(2026, 10, 20, 9, 1, 0));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByTestId('week-stale')).toBeInTheDocument();
    expect(rowsIn(cell('2026-11-19'))).toHaveLength(2);
    expect(screen.queryByTestId('week-error')).not.toBeInTheDocument();
  });

  it('an empty week says nothing is waiting, and is not an error', async () => {
    open([weekMock([]), waitingMock([]), ...noteMocks()]);
    await ready();
    expect(screen.getByTestId('week-unscheduled-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('week-task')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('week-count')).toHaveLength(8);
  });
});

describe('dragging a task to another day (W4)', () => {
  beforeEach(() => {
    // The spread (and so dragging) is on only where there is room for it.
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: true,
      media: query,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => {
    delete document.elementFromPoint;
  });

  const over = (node) => {
    document.elementFromPoint = () => node;
  };
  const press = (text) => {
    const row = screen.getByText(text).closest('li');
    fireEvent.pointerDown(screen.getByText(text), { pointerId: 3, pointerType: 'pen', button: 0, clientX: 100, clientY: 100 });
    return row;
  };
  const moveTo = (x, y) => fireEvent.pointerMove(window, { pointerId: 3, clientX: x, clientY: y });
  const release = (x, y) => fireEvent.pointerUp(window, { pointerId: 3, clientX: x, clientY: y });

  it('a drag starts after 8px, marks the day under the pointer, and a drop there moves the task', async () => {
    const move = moveMock('pellets', { dueDate: '2026-11-21', hasDueTime: false }, { ...PELLETS, dueDate: dateOnly('2026-11-21') });
    open([weekMock(), waitingMock(), ...noteMocks(), move]);
    await ready();
    over(cell('2026-11-21'));

    press('Buy layer pellets');
    moveTo(104, 103); // 5px: still a press
    expect(screen.queryByTestId('week-drag-ghost')).not.toBeInTheDocument();
    moveTo(160, 140);
    expect(screen.getByTestId('week-drag-ghost')).toHaveTextContent('Buy layer pellets');
    expect(cell('2026-11-21')).toHaveAttribute('data-drop-over', 'true');
    expect(cell('2026-11-19')).not.toHaveAttribute('data-drop-over');

    release(160, 140);
    expect(screen.queryByTestId('week-drag-ghost')).not.toBeInTheDocument();
    await waitFor(() => expect(move.result).toHaveBeenCalledTimes(1));
    expect(rowsIn(cell('2026-11-21'))).toContain('Buy layer pellets');
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('Escape, a cancelled pointer, a drop on "Not scheduled" or on its own day change nothing', async () => {
    // No move is mocked: any mutation would fail and say "Couldn’t move that task".
    open([weekMock(), waitingMock(), ...noteMocks()]);
    await ready();

    over(cell('2026-11-21'));
    press('Buy layer pellets');
    moveTo(160, 140);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('week-drag-ghost')).not.toBeInTheDocument();
    release(160, 140);

    press('Buy layer pellets');
    moveTo(160, 140);
    fireEvent.pointerCancel(window, { pointerId: 3 });
    expect(screen.queryByTestId('week-drag-ghost')).not.toBeInTheDocument();
    release(160, 140);

    over(unscheduled());
    press('Buy layer pellets');
    moveTo(160, 140);
    expect(document.querySelector('[data-drop-over="true"]')).toBeNull();
    release(160, 140);

    over(cell('2026-11-19'));
    press('Buy layer pellets');
    moveTo(160, 140);
    expect(document.querySelector('[data-drop-over="true"]')).toBeNull();
    release(160, 140);

    await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(rowsIn(cell('2026-11-19'))).toEqual(['2:00 PMCall the vet', 'Buy layer pellets']);
    expect(screen.queryByText(/Couldn’t move/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('a swipe that starts on a task row is a drag, not a page turn (W7)', async () => {
    open([weekMock(), waitingMock(), ...noteMocks()]);
    await ready();
    const row = screen.getByText('Buy layer pellets');
    fireEvent.pointerDown(row, { pointerType: 'touch', isPrimary: true, pointerId: 9, clientX: 400, clientY: 300 });
    fireEvent.pointerUp(row, { pointerType: 'touch', isPrimary: true, pointerId: 9, clientX: 200, clientY: 310 });
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/week$/);
  });
});

describe('a day cell that cannot scroll', () => {
  const group = (tasks) => groupWeek(tasks, KEYS, TODAY).days['2026-11-18'];
  const many = Array.from({ length: 6 }, (_, i) => makeTask({ id: `t${i}`, content: `Task ${i + 1}`, dueDate: dateOnly('2026-11-18'), createdAt: `2026-11-0${i + 1}T12:00:00.000Z` }));
  const done = makeTask({ id: 'd', content: 'Done one', dueDate: dateOnly('2026-11-18'), status: 'completed', completedAt: '2026-11-18T15:00:00.000Z' });

  const renderCell = (tasks, capacity) =>
    renderDay(
      <MemoryRouter>
        <DayCell dayKey="2026-11-18" today={TODAY} group={group(tasks)} ready fit capacity={capacity} onToggle={() => {}} onMenu={() => {}} />
      </MemoryRouter>
    );

  it('shows the rows that fit and a "+N more" line that opens the day', () => {
    renderCell([...many, done], 4);
    expect(screen.getAllByTestId('week-task').map((r) => r.textContent)).toEqual(['Task 1', 'Task 2', 'Task 3']);
    const more = screen.getByRole('link', { name: '3 more on Wednesday. Open the day' });
    expect(more).toHaveTextContent('+3 more· 1 done');
    expect(more).toHaveAttribute('href', '/day/2026-11-18');
    // The count is still every open task, not just the ones shown.
    expect(screen.getByTestId('week-count')).toHaveTextContent('6 to do');
  });

  it('folds done tasks into an "n done" line when only they do not fit', () => {
    renderCell([...many.slice(0, 2), done, { ...done, id: 'd2', content: 'Done two' }], 3);
    expect(screen.getAllByTestId('week-task').map((r) => r.textContent)).toEqual(['Task 1', 'Task 2']);
    expect(screen.getByTestId('week-done-line')).toHaveTextContent('2 done');
    expect(screen.queryByTestId('week-more')).not.toBeInTheDocument();
  });
});

describe('the day page’s way to the week (W8)', () => {
  it('has a Week button in its header', async () => {
    const onWeek = vi.fn();
    renderDay(<DayHeader dayKey={TODAY} today={TODAY} now={new Date()} onPrev={() => {}} onNext={() => {}} onToday={() => {}} onWeek={onWeek} onSignOut={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(onWeek).toHaveBeenCalledTimes(1);
  });
});
