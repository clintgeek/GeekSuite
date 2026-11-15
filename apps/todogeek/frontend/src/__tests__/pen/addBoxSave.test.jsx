/** The add box during a save (1.14), its two-line field and preview (3.17), and its "today" confirmation (3.22). */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createTodoTheme } from '../../theme/theme';
import AddBox from '../../components/pen/AddBox';
import { previewLine } from '../../components/pen/addPreview';
import { parseTaskInputDetailed } from '../../utils/parseTaskInput';

process.env.TZ = 'America/Chicago';
const mount = (onAdd) => render(
  <ThemeProvider theme={createTodoTheme('light')}><AddBox now={new Date()} onAdd={onAdd} onHelp={vi.fn()} /></ThemeProvider>,
);
const box = () => screen.getByRole('textbox', { name: 'New task' });

describe('1.14 the box keeps what you type while it saves', () => {
  it('clears only the line that was sent', async () => {
    let resolve;
    const onAdd = vi.fn(() => new Promise((r) => { resolve = r; }));
    mount(onAdd);
    fireEvent.change(box(), { target: { value: 'buy milk' } });
    await act(async () => { fireEvent.submit(box().closest('form')); });
    fireEvent.change(box(), { target: { value: 'buy milk and eggs for the next one' } });
    await act(async () => { resolve({ id: 'n1' }); });
    expect(box()).toHaveValue('buy milk and eggs for the next one');
  });
  it('and still clears when nothing was typed meanwhile', async () => {
    mount(vi.fn(() => Promise.resolve({ id: 'n1' })));
    fireEvent.change(box(), { target: { value: 'buy milk' } });
    await act(async () => { fireEvent.submit(box().closest('form')); });
    expect(box()).toHaveValue('');
  });
});

describe('3.22 a task for today is confirmed too', () => {
  it('passes where="today" so the toast says it landed (the row is off screen behind the keyboard)', async () => {
    const onAdd = vi.fn(() => Promise.resolve({ id: 'n1' }));
    mount(onAdd);
    fireEvent.change(box(), { target: { value: 'buy milk' } });
    await act(async () => { fireEvent.submit(box().closest('form')); });
    expect(onAdd.mock.calls[0][1].where).toBe('today');
    expect(screen.getByRole('status')).toHaveTextContent('Added: buy milk.');
  });
});

describe('3.17 two lines and a preview', () => {
  it('is a growing text field; Enter adds and a pasted line break becomes a space', async () => {
    const onAdd = vi.fn(() => Promise.resolve({ id: 'n1' }));
    mount(onAdd);
    expect(box().tagName).toBe('TEXTAREA');
    fireEvent.change(box(), { target: { value: 'buy milk\nand eggs' } });
    expect(box()).toHaveValue('buy milk and eggs');
    await act(async () => { fireEvent.keyDown(box(), { key: 'Enter' }); });
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
  it('says what it understood under the box', () => {
    mount(vi.fn());
    fireEvent.change(box(), { target: { value: 'call Dana tomorrow 2pm #work !high' } });
    const line = document.querySelector('[data-add-preview]').textContent;
    expect(line).toMatch(/tomorrow at 2 ?pm/i);
    expect(line).toContain('#work');
    expect(line).toContain('high');
  });
  it('is empty for a line with no words of its own', () => {
    expect(previewLine(parseTaskInputDetailed('', { now: new Date() }), new Date())).toBe('');
  });
  it('labels Private on every width', () => {
    mount(vi.fn());
    expect(screen.getByRole('checkbox', { name: 'Private' }).textContent).toContain('Private');
  });
});
