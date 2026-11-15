/**
 * What a row shows and does, wave 2: notes and events are not to-dos (D4),
 * done is neutral ink (D7), a passed time is marked, row actions follow ANY
 * hover-capable pointer (4.3), a finished row has no left swipe (3.21), a
 * private task's words stay out of the date sheet (D5 / 1.21).
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createTodoTheme } from '../../theme/theme';
import { penOf } from '../../theme/pen';
import PenRow, { timePassed } from '../../components/pen/PenRow';
import DatePickSheet from '../../components/pen/DatePickSheet';
import { PrivacyProvider } from '../../context/PrivacyContext';
import { applyKinds, isCheckable } from '../../components/pen/penKinds';
import { swipeOutcome } from '../../hooks/useSwipe';
import { todaySections } from '../../utils/penViews';

process.env.TZ = 'America/Chicago';
const now = new Date(2026, 8, 29, 10, 0);
const theme = createTodoTheme('light');
const p = penOf(theme);
const t = (over = {}) => ({
  id: 't1', content: 'Water the plants', status: 'pending', priority: null, note: null, tags: [],
  dueDate: '2026-09-29T00:00:00.000Z', ...over,
});
const row = (task, props = {}) => render(
  <ThemeProvider theme={theme}><PrivacyProvider><ul><PenRow task={task} now={now} {...props} /></ul></PrivacyProvider></ThemeProvider>,
);

const realMatchMedia = window.matchMedia;
const media = (re) => {
  window.matchMedia = (query) => ({
    matches: re.test(query), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  });
};
afterEach(() => { window.matchMedia = realMatchMedia; });

describe('notes and events are written down, not ticked (D4)', () => {
  it('a note and an event have no checkbox, and show their glyph where it would be', () => {
    const { unmount } = row(t({ signifier: '-', content: 'Gate code is 4471' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(document.querySelector('[data-record-glyph="-"]')).not.toBeNull();
    unmount();
    row(t({ signifier: '@', content: 'Standup' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(document.querySelector('[data-record-glyph="@"]')).not.toBeNull();
  });

  it('a question, an important task, a migrated and a scheduled one are still to-dos with a glyph', () => {
    for (const signifier of ['?', '!', '>', '<']) {
      const { unmount } = row(t({ signifier }));
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(document.querySelector('[data-kind-glyph]').textContent).toBe(signifier);
      unmount();
    }
  });

  it('they do not count as to-dos and do not carry over', () => {
    const tasks = [
      t({ id: 'todo' }),
      t({ id: 'note', signifier: '-' }),
      t({ id: 'event', signifier: '@' }),
      t({ id: 'old-todo', dueDate: '2026-09-25T00:00:00.000Z' }),
      t({ id: 'old-event', signifier: '@', dueDate: '2026-09-25T00:00:00.000Z' }),
      t({ id: 'old-note', signifier: '-', dueDate: '2026-09-25T00:00:00.000Z' }),
      t({ id: 'anytime-note', signifier: '-', dueDate: null }),
    ];
    const s = applyKinds(todaySections(tasks, now));
    expect(s.overdue.map((x) => x.id)).toEqual(['old-todo']);
    expect(s.today.map((x) => x.id).sort()).toEqual(['event', 'note', 'todo']); // still shown today
    expect(s.counts.toDo).toBe(2); // todo + old-todo
    expect(isCheckable(t())).toBe(true);
  });

  it('a swipe right on a note does not promise done', () => {
    expect(swipeOutcome(120, 360, { right: false })).toBeNull();
    expect(swipeOutcome(120, 360)).toBe('done');
  });
});

describe('a finished row has no left swipe (3.21)', () => {
  it('left is off, right (not done) is on', () => {
    expect(swipeOutcome(-100, 360, { left: false })).toBeNull();
    expect(swipeOutcome(-300, 360, { left: false })).toBeNull();
    expect(swipeOutcome(-100, 360)).toBe('tomorrow');
    expect(swipeOutcome(100, 360, { left: false })).toBe('done');
  });
});

describe('done is neutral ink, not red (D7)', () => {
  it('the ticked square is filled grey-ink, never the red of high and late', () => {
    row(t({ status: 'completed' }));
    const square = screen.getByRole('checkbox').firstElementChild;
    const bg = getComputedStyle(square).backgroundColor;
    expect(bg).not.toBe('');
    const hex = (c) => c.replace('#', '').toLowerCase();
    const rgb = (h) => `rgb(${[0, 2, 4].map((i) => parseInt(hex(h).slice(i, i + 2), 16)).join(', ')})`;
    expect(bg).toBe(rgb(p.grey));
    expect(bg).not.toBe(rgb(p.red));
  });
});

describe('a passed time is marked', () => {
  const when = { text: '9am' };
  it('an open task timed earlier today', () => {
    expect(timePassed(t({ dueDate: new Date(2026, 8, 29, 9).toISOString() }), when, now)).toBe(true);
  });
  it('not a later time, a done task, a date-only task or another day', () => {
    expect(timePassed(t({ dueDate: new Date(2026, 8, 29, 15).toISOString() }), { text: '3pm' }, now)).toBe(false);
    expect(timePassed(t({ status: 'completed', dueDate: new Date(2026, 8, 29, 9).toISOString() }), when, now)).toBe(false);
    expect(timePassed(t(), { text: '' }, now)).toBe(false);
    expect(timePassed(t({ dueDate: new Date(2026, 8, 28, 9).toISOString() }), { text: '1 day late', late: true }, now)).toBe(false);
  });
  it('the row says so', () => {
    row(t({ dueDate: new Date(2026, 8, 29, 9).toISOString() }));
    expect(screen.getByText('9am · passed')).toBeInTheDocument();
  });
});

describe('row actions follow any hover-capable pointer (4.3)', () => {
  it('a tablet whose PRIMARY pointer is a finger, with a trackpad attached, gets them', () => {
    media(/any-hover:\s*hover|any-pointer:\s*fine/);
    row(t());
    expect(document.querySelector('[data-row-actions]')).not.toBeNull();
  });
  it('a touch-only device does not', () => {
    media(/^$/);
    row(t());
    expect(document.querySelector('[data-row-actions]')).toBeNull();
  });
});

describe('the date sheet does not repeat a private task’s words', () => {
  it('names it "Private task"', () => {
    render(
      <ThemeProvider theme={theme}>
        <DatePickSheet task={t({ private: true, content: 'Fire Jane' })} now={now} onPick={vi.fn()} onClose={vi.fn()} />
      </ThemeProvider>,
    );
    expect(document.body.textContent).not.toContain('Fire Jane');
    expect(screen.getByText('Private task')).toBeInTheDocument();
  });
  it('still names an ordinary task', () => {
    render(
      <ThemeProvider theme={theme}>
        <DatePickSheet task={t({ content: 'Water the plants' })} now={now} onPick={vi.fn()} onClose={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Water the plants')).toBeInTheDocument();
  });
});
