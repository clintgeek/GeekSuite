/**
 * The add box: parts understood are underlined in the sentence as you type;
 * a screen reader gets the same as a sentence; Enter adds and keeps focus.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createBuJoTheme } from '../../theme/theme';
import AddBox from '../../components/pen/AddBox';
import { segmentLine } from '../../utils/quickAdd';

process.env.TZ = 'America/Chicago';
const now = new Date(2026, 8, 29, 10, 0);

const mount = (props = {}) => render(
  <ThemeProvider theme={createBuJoTheme('light')}>
    <AddBox now={now} onAdd={vi.fn(() => Promise.resolve({ id: 'n1' }))} onHelp={vi.fn()} {...props} />
  </ThemeProvider>,
);

const type = (text) => {
  const box = screen.getByRole('textbox', { name: 'New task' });
  fireEvent.change(box, { target: { value: text } });
  return box;
};

describe('segmentLine', () => {
  it('splits a line into plain and understood runs, in order', () => {
    expect(segmentLine('call Dana tomorrow #work', [
      { start: 19, end: 24, kind: 'tag' },
      { start: 10, end: 18, kind: 'date' },
    ])).toEqual([
      { text: 'call Dana ', kind: null },
      { text: 'tomorrow', kind: 'date' },
      { text: ' ', kind: null },
      { text: '#work', kind: 'tag' },
    ]);
  });
});

describe('AddBox', () => {
  it('underlines what it understood, in place, and leaves the rest plain', () => {
    const { container } = mount();
    type('call Dana tomorrow 2pm #work !high');
    const kinds = [...container.querySelectorAll('[data-add-overlay] [data-kind]')].map((el) => [el.dataset.kind, el.textContent]);
    expect(kinds).toEqual([['date', 'tomorrow 2pm'], ['tag', '#work'], ['priority', '!high']]);
    const overlay = container.querySelector('[data-add-overlay]');
    expect(overlay.textContent).toBe('call Dana tomorrow 2pm #work !high');
    // Dates in red, tags grey.
    const date = container.querySelector('[data-kind="date"]');
    expect(getComputedStyle(date).textDecorationColor.replace(/\s/g, '')).toMatch(/rgb\(200,32,42\)|#c8202a/i);
  });

  it('leaves what will not parse plain: a misspelt date, a half-typed priority', () => {
    const { container } = mount();
    type('call Dana tomorow !hig #work');
    const kinds = [...container.querySelectorAll('[data-add-overlay] [data-kind]')].map((el) => el.dataset.kind);
    expect(kinds).toEqual(['tag']);
  });

  it('raises the priority mark in the margin', () => {
    const { container } = mount();
    type('ship it !high');
    expect(container.querySelector('[data-add-priority="1"]')).not.toBeNull();
    type('ship it');
    expect(container.querySelector('[data-add-priority]')).toBeNull();
  });

  it('tells a screen reader what it understood, via aria-describedby', () => {
    mount();
    const box = type('call Dana tomorrow 2pm #work !high');
    const id = box.getAttribute('aria-describedby');
    expect(document.getElementById(id).textContent)
      .toBe('Task: call Dana. Due tomorrow at 2 pm. High priority. Tagged work.');
  });

  it('Enter adds, clears the box, keeps focus in it, and says what was added', async () => {
    const onAdd = vi.fn(() => Promise.resolve({ id: 'n1' }));
    mount({ onAdd });
    const box = type('buy milk #house');
    box.focus();
    await act(async () => { fireEvent.submit(box.closest('form')); });
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [input] = onAdd.mock.calls[0];
    expect(input).toMatchObject({ content: 'buy milk', tags: ['house'], signifier: '*' });
    expect(box).toHaveValue('');
    expect(document.activeElement).toBe(box);
    expect(screen.getByRole('status')).toHaveTextContent('Added: buy milk.');
  });

  it('keeps the text when the add fails', async () => {
    mount({ onAdd: vi.fn(() => Promise.resolve(null)) });
    const box = type('buy milk');
    await act(async () => { fireEvent.submit(box.closest('form')); });
    expect(box).toHaveValue('buy milk');
  });
});
