/**
 * Marking a task private: the add box's Private tick box and the typed
 * `(private)` token are one thing; the inline editor turns it on and off; and
 * nothing the app says out loud afterwards (the live region, the toasts)
 * repeats a private task's words.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createTodoTheme } from '../../theme/theme';
import AddBox from '../../components/pen/AddBox';
import InlineEditor from '../../components/pen/InlineEditor';
import { changedFields, initialForm } from '../../components/pen/editorForm';

process.env.TZ = 'America/Chicago';
const now = new Date(2026, 8, 29, 10, 0);
const theme = createTodoTheme('light');

const mountBox = (onAdd = vi.fn(() => Promise.resolve({ id: 'n1' }))) => {
  const utils = render(<ThemeProvider theme={theme}><AddBox now={now} onAdd={onAdd} onHelp={vi.fn()} /></ThemeProvider>);
  return { ...utils, onAdd };
};
const box = () => screen.getByRole('textbox', { name: 'New task' });
const tick = () => screen.getByRole('checkbox', { name: 'Private' });

describe('the add box: tick box and token are one thing', () => {
  it('typing (private) ticks the box, underlines the token, and marks it', () => {
    const { container } = mountBox();
    expect(tick()).toHaveAttribute('aria-checked', 'false');
    fireEvent.change(box(), { target: { value: 'Fire Jane (private) #hr' } });
    expect(tick()).toHaveAttribute('aria-checked', 'true');
    expect(container.querySelector('[data-add-private="true"]')).not.toBeNull();
    const kinds = [...container.querySelectorAll('[data-add-overlay] [data-kind]')].map((el) => [el.dataset.kind, el.textContent]);
    expect(kinds).toEqual([['private', '(private)'], ['tag', '#hr']]);
  });

  it('ticking adds the token; unticking takes it out', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(); return 0; });
    mountBox();
    fireEvent.change(box(), { target: { value: 'Fire Jane #hr' } });
    fireEvent.click(tick());
    expect(box()).toHaveValue('Fire Jane #hr (private)');
    expect(tick()).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(box());
    fireEvent.click(tick());
    expect(box()).toHaveValue('Fire Jane #hr');
    expect(tick()).toHaveAttribute('aria-checked', 'false');
  });

  it('Enter sends private: true and the live region does not repeat the words', async () => {
    const { onAdd, container } = mountBox();
    fireEvent.change(box(), { target: { value: 'Fire Jane (private)' } });
    await act(async () => { fireEvent.submit(container.querySelector('form')); });
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ content: 'Fire Jane', private: true }), expect.anything());
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Added a private task.');
    expect(status.textContent).not.toMatch(/Jane/);
  });

  it('an ordinary task is announced as before (the control)', async () => {
    const { onAdd, container } = mountBox();
    fireEvent.change(box(), { target: { value: 'Buy milk' } });
    await act(async () => { fireEvent.submit(container.querySelector('form')); });
    expect('private' in onAdd.mock.calls[0][0]).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('Added: Buy milk.');
  });
});

describe('the inline editor turns it on and off', () => {
  const t = (over) => ({ id: 't1', content: 'Fire Jane', status: 'pending', tags: [], dueDate: null, ...over });

  it('sends only `private` when only the box changed', () => {
    expect(initialForm(t()).private).toBe(false);
    expect(changedFields(t(), { ...initialForm(t()), private: true })).toEqual({ private: true });
    expect(changedFields(t({ private: true }), { ...initialForm(t({ private: true })), private: false })).toEqual({ private: false });
    expect(changedFields(t({ private: true }), initialForm(t({ private: true })))).toEqual({});
  });

  it('the Private tick box saves it', async () => {
    const onSave = vi.fn(() => Promise.resolve(true));
    render(<ThemeProvider theme={theme}><InlineEditor task={t()} onSave={onSave} onCancel={vi.fn()} onDelete={vi.fn()} /></ThemeProvider>);
    const privateBox = screen.getByRole('checkbox', { name: /private/i });
    expect(privateBox).not.toBeChecked();
    fireEvent.click(privateBox);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(onSave).toHaveBeenCalledWith({ private: true }, 'THIS_INSTANCE');
  });
});

/* ---------- toasts ---------- */

const fake = {};
const toasts = [];
vi.mock('../../context/TaskContext.jsx', () => ({ useTaskContext: () => fake }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return { ...actual, useMutation: () => [vi.fn(() => Promise.resolve({}))] };
});
vi.mock('@geeksuite/ui', async () => {
  const actual = await vi.importActual('@geeksuite/ui');
  return {
    ...actual,
    useToast: () => ({ notify: (message, opts) => { toasts.push({ message, ...opts }); return toasts.length; }, dismiss: vi.fn() }),
    useReducedMotion: () => true,
  };
});
const { PenProvider, usePen } = await import('../../context/PenContext.jsx');

describe('no toast echoes a private task’s words', () => {
  beforeEach(() => { toasts.length = 0; });

  it('done, moved, moved to tomorrow, deleted, added for another day', async () => {
    const task = { id: 'p1', content: 'Fire Jane', private: true, status: 'pending', dueDate: '2026-09-29T00:00:00.000Z' };
    Object.assign(fake, {
      tasks: [task],
      fetchTasks: vi.fn(() => Promise.resolve()),
      updateTaskStatus: vi.fn((id, status) => Promise.resolve({ id, status })),
      updateTask: vi.fn((id, fields) => Promise.resolve({ id, ...fields })),
      deleteTask: vi.fn(() => Promise.resolve(true)),
      createTask: vi.fn((input) => Promise.resolve({ id: 'new1', ...input })),
    });
    const ref = { current: null };
    const Probe = () => { ref.current = usePen(); return null; };
    render(<PenProvider><Probe /></PenProvider>);
    await act(async () => { await ref.current.toggleDone(task); });
    await act(async () => { await ref.current.moveToTomorrow(task); });
    await act(async () => { await ref.current.moveTo(task, '2026-10-02', {}); });
    await act(async () => { ref.current.remove(task); });
    await act(async () => { await ref.current.add({ content: 'Fire Jane', private: true }, { where: 'tomorrow' }); });
    expect(toasts.length).toBeGreaterThanOrEqual(5);
    for (const t of toasts) expect(String(t.message)).not.toMatch(/Jane/);
  });
});
