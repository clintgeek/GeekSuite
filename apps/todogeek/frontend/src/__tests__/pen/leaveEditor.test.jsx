/**
 * Leaving an open editor (plan 1.13), the recurring dialog's Escape (Tier 6),
 * stable row handlers (5.12) and ticking an open row (3.19), through
 * hooks `usePenRows` and `InlineEditor`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createTodoTheme } from '../../theme/theme';
import InlineEditor from '../../components/pen/InlineEditor';

process.env.TZ = 'America/Chicago';

const pen = {};
// A NEW object on every call, as the real context is on every change.
vi.mock('../../context/PenContext', () => ({ usePen: () => ({ ...pen }) }));
const { default: usePenRows } = await import('../../components/pen/usePenRows');

const now = new Date(2026, 8, 29, 10, 0);
const t = (id, over = {}) => ({
  id, content: `Task ${id}`, status: 'pending', priority: null, note: null, tags: [],
  dueDate: '2026-09-29T00:00:00.000Z', recurrenceRule: null, ...over,
});
const TASKS = [t('a'), t('b')];
const theme = createTodoTheme('light');

function resetPen() {
  Object.keys(pen).forEach((k) => delete pen[k]);
  Object.assign(pen, {
    now,
    save: vi.fn(() => Promise.resolve({ id: 'a' })),
    toggleDone: vi.fn(),
    moveTo: vi.fn(),
    moveToTomorrow: vi.fn(),
    remove: vi.fn(),
  });
}
beforeEach(resetPen);

function List({ tasks = TASKS }) {
  const { renderRow, sheet } = usePenRows(tasks);
  return <ThemeProvider theme={theme}><ul>{tasks.map((x) => renderRow(x))}</ul>{sheet}</ThemeProvider>;
}
const words = (id) => screen.getByRole('button', { name: new RegExp(`^task ${id}`, 'i') });

describe('leaving an open editor saves what changed (1.13)', () => {
  it('opening another row saves the first one', async () => {
    render(<List />);
    fireEvent.click(words('a'));
    fireEvent.click(screen.getByRole('button', { name: 'High' }));
    await act(async () => { fireEvent.click(words('b')); });
    expect(pen.save).toHaveBeenCalledTimes(1);
    expect(pen.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { priority: 1 }, 'THIS_INSTANCE');
    // …and the second row is the one open now.
    expect(screen.getByRole('form', { name: /edit task b/i })).toBeInTheDocument();
  });

  it('tapping the open row’s words again saves and closes', async () => {
    render(<List />);
    fireEvent.click(words('a'));
    fireEvent.click(screen.getByRole('button', { name: 'Low' }));
    await act(async () => { fireEvent.click(words('a')); });
    expect(pen.save).toHaveBeenCalledWith(expect.anything(), { priority: 3 }, 'THIS_INSTANCE');
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('with nothing changed it just closes', async () => {
    render(<List />);
    fireEvent.click(words('a'));
    await act(async () => { fireEvent.click(words('b')); });
    expect(pen.save).not.toHaveBeenCalled();
  });

  it('Escape and Cancel still discard', () => {
    render(<List />);
    fireEvent.click(words('a'));
    fireEvent.click(screen.getByRole('button', { name: 'High' }));
    fireEvent.keyDown(screen.getByRole('form'), { key: 'Escape' });
    expect(screen.queryByRole('form')).toBeNull();
    expect(pen.save).not.toHaveBeenCalled();
  });

  it('emptied words keep the editor open instead of saving nothing', async () => {
    render(<List />);
    fireEvent.click(words('a'));
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: '  ' } });
    await act(async () => { fireEvent.click(words('b')); });
    expect(pen.save).not.toHaveBeenCalled();
    expect(screen.getByRole('form', { name: /edit task a/i })).toBeInTheDocument();
  });

  it('a repeating task asks "this one or every one?" instead of guessing — in the editor, not a dialog', async () => {
    const repeat = [t('a', { recurrenceRule: 'DTSTART:20260929T140000Z\nRRULE:FREQ=DAILY' }), t('b')];
    render(<List tasks={repeat} />);
    fireEvent.click(words('a'));
    fireEvent.click(screen.getByRole('button', { name: 'High' }));
    await act(async () => { fireEvent.click(words('b')); });
    expect(pen.save).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('This task repeats. Save the change to this one, or to every one?');
    expect(screen.getByRole('form', { name: /edit task a/i })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save every one' })); });
    expect(pen.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { priority: 1 }, 'ALL_INSTANCES');
  });

  it('ticking the open row saves its edit and closes it (3.19)', async () => {
    render(<List />);
    fireEvent.click(words('a'));
    fireEvent.click(screen.getByRole('button', { name: 'High' }));
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: /^done: task a/i })); });
    expect(pen.save).toHaveBeenCalledWith(expect.anything(), { priority: 1 }, 'THIS_INSTANCE');
    expect(pen.toggleDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('an editor whose row left the list closes with it', () => {
    const { rerender } = render(<List />);
    fireEvent.click(words('a'));
    rerender(<List tasks={[TASKS[1]]} />);
    expect(screen.queryByRole('form')).toBeNull();
  });
});

describe('a repeating task: which ones to save is the Save button (review 2026-11-18 #3)', () => {
  const repeat = () => t('r', { recurrenceRule: 'DTSTART:20260929T140000Z\nRRULE:FREQ=DAILY' });
  it('with changes, Save becomes "Save this one" and "Save every one": one tap, no dialog', async () => {
    const onSave = vi.fn(() => Promise.resolve(true));
    render(<ThemeProvider theme={theme}><InlineEditor task={repeat()} onSave={onSave} onCancel={vi.fn()} /></ThemeProvider>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'High' }));
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save this one' })); });
    expect(onSave).toHaveBeenCalledWith({ priority: 1 }, 'THIS_INSTANCE');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).not.toMatch(/instance/i);
  });
  // Review 2026-11-19: the question stayed set after the fields went back to
  // what is saved, so the next change showed it with nothing having asked.
  it('changes undone by hand take the question away; a new change does not bring it back unasked', () => {
    render(<ThemeProvider theme={theme}><InlineEditor task={repeat()} onSave={vi.fn()} onCancel={vi.fn()} /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'High' }));
    fireEvent.keyDown(screen.getByLabelText('Task', { selector: 'input' }), { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(/this one, or to every one/);
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Low' }));
    expect(screen.getByRole('button', { name: 'Save this one' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('Enter asks rather than guessing; Escape still discards', () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(<ThemeProvider theme={theme}><InlineEditor task={repeat()} onSave={onSave} onCancel={onCancel} /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'High' }));
    fireEvent.keyDown(screen.getByLabelText('Task', { selector: 'input' }), { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/this one, or to every one/);
    fireEvent.keyDown(screen.getByLabelText('Task', { selector: 'input' }), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
  it('with no question open, Escape still discards', () => {
    const onCancel = vi.fn();
    render(<ThemeProvider theme={theme}><InlineEditor task={t('r')} onSave={vi.fn()} onCancel={onCancel} /></ThemeProvider>);
    fireEvent.keyDown(screen.getByLabelText('Task', { selector: 'input' }), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('row handlers are stable across changes (5.12)', () => {
  it('keep their identity when the pen object is rebuilt', () => {
    const wrapper = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;
    const { result, rerender } = renderHook(() => usePenRows(TASKS), { wrapper });
    const first = result.current.renderRow(TASKS[0]).props;
    // A new pen object (a toast, a fetch, a tick) — every handler is rebuilt upstream.
    Object.assign(pen, { toggleDone: vi.fn(), moveToTomorrow: vi.fn(), save: vi.fn() });
    rerender();
    const second = result.current.renderRow(TASKS[0]).props;
    for (const name of ['onDone', 'onTomorrow', 'onPickDate', 'onToggleExpand']) {
      expect(second[name]).toBe(first[name]);
    }
  });

  it('call the LATEST pen, not the one they were made with', () => {
    const wrapper = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;
    const { result, rerender } = renderHook(() => usePenRows(TASKS), { wrapper });
    const onDone = result.current.renderRow(TASKS[0]).props.onDone;
    const fresh = vi.fn();
    pen.toggleDone = fresh;
    rerender();
    onDone(TASKS[0]);
    expect(fresh).toHaveBeenCalledWith(TASKS[0]);
  });
});
