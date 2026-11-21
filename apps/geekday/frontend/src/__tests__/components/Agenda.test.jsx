// Runs in America/Chicago (vitest.config.js).
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Agenda from '../../components/Agenda.jsx';
import { groupDayTasks } from '../../lib/tasks.js';
import { dateOnly, makeTask, renderDay } from '../helpers.jsx';

const TODAY = '2026-11-20';
const NOW = new Date(2026, 10, 20, 9, 0, 0);

const LIST = [
  makeTask({ content: 'Pay the feed bill', dueDate: dateOnly('2026-11-18') }),
  makeTask({ content: 'Call the vet', dueDate: '2026-11-20T20:00:00.000Z', hasDueTime: true }),
  makeTask({ content: 'Buy layer pellets', dueDate: dateOnly(TODAY) }),
  makeTask({ content: 'Collect eggs', dueDate: dateOnly(TODAY), status: 'completed', completedAt: '2026-11-20T13:00:00.000Z' }),
];

function setup({ list = LIST, status = 'ready', stale = false, dayKey = TODAY, ...handlers } = {}) {
  const props = {
    dayKey,
    today: TODAY,
    now: NOW,
    tasks: { groups: groupDayTasks(list, dayKey, TODAY), status, stale, retry: vi.fn() },
    onToggle: vi.fn(),
    onMove: vi.fn(),
    onAdd: vi.fn().mockResolvedValue(true),
    ...handlers,
  };
  renderDay(<Agenda {...props} />);
  return props;
}

describe('Agenda', () => {
  it('lists the day as overdue, scheduled and to do (spec req 1)', () => {
    setup();
    const section = (name) => screen.getByRole('region', { name: new RegExp(`^${name}`) });
    expect(within(section('Overdue')).getByText('Pay the feed bill')).toBeInTheDocument();
    expect(within(section('Scheduled')).getByText('Call the vet')).toBeInTheDocument();
    expect(within(section('Scheduled')).getByText(/2:00\sPM/)).toBeInTheDocument();
    expect(within(section('To do')).getByText('Buy layer pellets')).toBeInTheDocument();
    expect(screen.getByTestId('agenda-count')).toHaveTextContent('3 to do');
  });

  it('says which day an overdue task was due, without changing it (spec req 13)', () => {
    setup();
    const row = screen.getByText('Pay the feed bill').closest('[data-testid="task-row"]');
    expect(row).toHaveAttribute('data-task-tone', 'overdue');
    expect(within(row).getByText(/Wed, Nov 18/)).toBeInTheDocument();
  });

  it('ticks a task (spec req 2)', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Buy layer pellets" done' }));
    expect(props.onToggle).toHaveBeenCalledWith(expect.objectContaining({ content: 'Buy layer pellets' }));
  });

  it('moves a task to the next day from its row (spec req 4)', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Move "Call the vet" to tomorrow' }));
    expect(props.onMove).toHaveBeenCalledWith(expect.objectContaining({ content: 'Call the vet' }));
  });

  it('names the real next day when the page is not today', () => {
    setup({ dayKey: '2026-11-24', list: [makeTask({ content: 'Trim hooves', dueDate: dateOnly('2026-11-24') })] });
    expect(screen.getByRole('button', { name: 'Move "Trim hooves" to Wed, Nov 25' })).toBeInTheDocument();
  });

  it('keeps finished tasks behind a Done toggle, where they can be reopened', async () => {
    const props = setup();
    expect(screen.queryByText('Collect eggs')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('done-toggle'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark "Collect eggs" not done' }));
    expect(props.onToggle).toHaveBeenCalledWith(expect.objectContaining({ content: 'Collect eggs' }));
  });

  it('shows how typed text was read, then adds it (spec req 3)', async () => {
    const props = setup();
    const input = screen.getByRole('textbox', { name: 'Add a task' });
    await userEvent.type(input, 'call vet fri 2pm');
    expect(screen.getByTestId('add-task-hint')).toHaveTextContent(/Fri, Nov 27 · 2:00\sPM/);
    await userEvent.keyboard('{Enter}');
    expect(props.onAdd).toHaveBeenCalledTimes(1);
    const [reading, text] = props.onAdd.mock.calls[0];
    expect(reading.input).toMatchObject({ content: 'call vet', hasDueTime: true });
    expect(text).toBe('call vet fri 2pm');
    expect(input).toHaveValue('');
  });

  it('keeps the typed text when the add fails', async () => {
    setup({ onAdd: vi.fn().mockResolvedValue(false) });
    const input = screen.getByRole('textbox', { name: 'Add a task' });
    await userEvent.type(input, 'buy feed{Enter}');
    expect(input).toHaveValue('buy feed');
  });

  it('cannot add nothing', async () => {
    const props = setup();
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a task' }), '   {Enter}');
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it('says so when the day is empty', () => {
    setup({ list: [] });
    expect(screen.getByTestId('agenda-empty')).toHaveTextContent('Nothing on the list today.');
    expect(screen.getByTestId('agenda-count')).toHaveTextContent('all clear');
  });

  it('a failed load is an error with Retry, never an empty day', async () => {
    const props = setup({ list: [], status: 'error' });
    expect(screen.queryByTestId('agenda-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agenda-count')).not.toBeInTheDocument();
    await userEvent.click(within(screen.getByTestId('agenda-error')).getByRole('button'));
    expect(props.tasks.retry).toHaveBeenCalled();
  });

  it('keeps the list and says it may be stale when a refresh fails', () => {
    setup({ stale: true });
    expect(screen.getByTestId('agenda-stale')).toBeInTheDocument();
    expect(screen.getByText('Call the vet')).toBeInTheDocument();
  });
});
