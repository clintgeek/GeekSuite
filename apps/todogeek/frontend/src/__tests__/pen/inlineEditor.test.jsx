/**
 * The inline editor: opens in place under the row (no dialog), sends only
 * what changed, and keeps an existing repeat's field as it was.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createTodoTheme } from '../../theme/theme';
import InlineEditor from '../../components/pen/InlineEditor';
import { changedFields, formDueDate, initialForm, parseTagText } from '../../components/pen/editorForm';
import PenRow from '../../components/pen/PenRow';

process.env.TZ = 'America/Chicago';

const task = (over = {}) => ({
  id: 't1', content: 'Write the retro notes', status: 'pending', priority: null, note: null,
  tags: ['work'], dueDate: '2026-09-29T00:00:00.000Z', recurrenceRule: null, ...over,
});
const wrap = (ui) => render(<ThemeProvider theme={createTodoTheme('light')}>{ui}</ThemeProvider>);

describe('the form model', () => {
  it('reads a date-only task as a date with no time', () => {
    expect(initialForm(task())).toMatchObject({ date: '2026-09-29', time: '', tags: '#work', priority: '' });
  });
  it('turns date + time back into a due date the gateway understands', () => {
    expect(formDueDate({ date: '', time: '' })).toBeNull();
    expect(formDueDate({ date: '2026-10-01', time: '' })).toBe('2026-10-01');
    const d = new Date(formDueDate({ date: '2026-10-01', time: '14:30' }));
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([1, 14, 30]);
  });
  it('sends only what changed', () => {
    const t = task();
    expect(changedFields(t, { ...initialForm(t), priority: '1' })).toEqual({ priority: 1 });
    expect(changedFields(t, { ...initialForm(t), tags: '#work #fd' })).toEqual({ tags: ['work', 'fd'] });
    expect(changedFields(t, { ...initialForm(t), date: '' })).toEqual({ dueDate: null });
    expect(changedFields(t, initialForm(t))).toEqual({});
  });
  it('reads tags however they are typed', () => {
    // The suite tag standard: case folds, punctuation is dropped, / nests.
    expect(parseTagText('#work fd, #Work #bad!tag #GeekSuite #Home/Garage')).toEqual(['work', 'fd', 'badtag', 'geek-suite', 'home/garage']);
  });
});

describe('InlineEditor', () => {
  it('saves the changed priority and closes', async () => {
    const onSave = vi.fn(() => Promise.resolve(true));
    const onCancel = vi.fn();
    wrap(<InlineEditor task={task()} onSave={onSave} onCancel={onCancel} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'High' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(onSave).toHaveBeenCalledWith({ priority: 1 }, 'THIS_INSTANCE');
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows Repeats only on a task that already repeats', () => {
    const { unmount } = wrap(<InlineEditor task={task()} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText('Repeats')).toBeNull();
    unmount();
    wrap(<InlineEditor task={task({ recurrenceRule: 'DTSTART:20260929T140000Z\nRRULE:FREQ=WEEKLY' })} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Repeats')).toBeInTheDocument();
  });

  it('opens in place under its row — no dialog', () => {
    const editor = <InlineEditor task={task()} onSave={vi.fn()} onCancel={vi.fn()} />;
    wrap(<ul><PenRow task={task()} now={new Date(2026, 8, 29)} expanded editor={editor} onToggleExpand={vi.fn()} /></ul>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('form', { name: /edit write the retro notes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /write the retro notes/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('Delete hands the task back to the page (which offers Undo)', () => {
    const onDelete = vi.fn();
    wrap(<InlineEditor task={task()} onSave={vi.fn()} onCancel={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });
});
