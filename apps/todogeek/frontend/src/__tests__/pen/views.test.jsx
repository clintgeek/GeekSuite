/**
 * The pages, wired: Today's carried-over line collapses to a count with
 * "Move all to today"; Upcoming shows only days that have something; Done
 * un-completes in one tap; a pinned tag filters.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createTodoTheme } from '../../theme/theme';
import { filterByTag } from '../../utils/penViews';

process.env.TZ = 'America/Chicago';

const pen = {};
vi.mock('../../context/PenContext', () => ({ usePen: () => pen }));
vi.mock('../../hooks/usePinnedTags', () => ({ default: () => ({ pinned: ['work'], toggle: vi.fn(), setPinned: vi.fn(), loaded: true }) }));

const { default: TodayPage } = await import('../../pages/TodayPage');
const { default: UpcomingPage } = await import('../../pages/UpcomingPage');
const { default: DonePage } = await import('../../pages/DonePage');

const now = new Date(2026, 8, 29, 10, 0);
const on = (m, d) => `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00.000Z`;
let seq = 0;
const t = (over) => ({ id: `t${++seq}`, status: 'pending', tags: [], createdAt: on(9, 1), ...over });

const CORPUS = [
  t({ content: 'Late one', dueDate: on(9, 25) }),
  t({ content: 'Late two', dueDate: on(9, 27), tags: ['work'] }),
  t({ content: 'Due today', dueDate: on(9, 29), tags: ['work'] }),
  t({ content: 'Whenever', dueDate: null }),
  t({ content: 'Tomorrow thing', dueDate: on(9, 30) }),
  t({ content: 'Friday thing', dueDate: on(10, 2) }),
  t({ content: 'Finished', dueDate: on(9, 29), status: 'completed', completedAt: new Date(2026, 8, 29, 9).toISOString() }),
];

function setPen(tagFilter = null) {
  Object.assign(pen, {
    loaded: true,
    now,
    corpus: CORPUS,
    visible: filterByTag(CORPUS, tagFilter),
    settling: new Set(),
    tagFilter,
    setTagFilter: vi.fn(),
    setHelpOpen: vi.fn(),
    toggleDone: vi.fn(),
    moveTo: vi.fn(),
    moveToTomorrow: vi.fn(),
    moveAllToToday: vi.fn(),
    remove: vi.fn(),
    save: vi.fn(),
    add: vi.fn(),
  });
}

const mount = (page) => render(
  <MemoryRouter>
    <ThemeProvider theme={createTodoTheme('light')}>{React.createElement(page)}</ThemeProvider>
  </MemoryRouter>,
);

beforeEach(() => setPen());

describe('Today', () => {
  it('collapses carried-over tasks to one line with a count', () => {
    mount(TodayPage);
    const line = screen.getByRole('button', { name: /2 carried over/i });
    expect(line).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Late one')).toBeNull();
    fireEvent.click(line);
    expect(screen.getByText('Late one')).toBeInTheDocument();
    expect(screen.getByText('4 days late')).toBeInTheDocument();
  });

  it('"Move all to today" hands every carried-over task over at once', () => {
    mount(TodayPage);
    fireEvent.click(screen.getByRole('button', { name: /move all to today/i }));
    expect(pen.moveAllToToday).toHaveBeenCalledTimes(1);
    expect(pen.moveAllToToday.mock.calls[0][0].map((x) => x.content)).toEqual(['Late one', 'Late two']);
  });

  it('shows today, then Anytime, and the desk-calendar counts', () => {
    mount(TodayPage);
    expect(screen.getByText('Due today')).toBeInTheDocument();
    const anytime = screen.getByRole('region', { name: 'Anytime' });
    expect(within(anytime).getByText('Whenever')).toBeInTheDocument();
    expect(screen.getByText('4 to do · 1 done')).toBeInTheDocument();
    expect(screen.queryByText('Tomorrow thing')).toBeNull();
  });

  it('keeps a ticked row in place, crossed, while it settles', () => {
    const done = { ...CORPUS[2], status: 'completed', completedAt: now.toISOString() };
    pen.visible = CORPUS.map((x) => (x.id === done.id ? done : x));
    pen.settling = new Set([done.id]);
    const { container } = mount(TodayPage);
    const row = container.querySelector(`[data-row-id="${done.id}"]`);
    expect(row).toHaveAttribute('data-crossed', 'true');
    expect(within(row).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  });

  it('a pinned tag filters the list', () => {
    setPen('work');
    mount(TodayPage);
    expect(screen.getByText('Due today')).toBeInTheDocument();
    expect(screen.queryByText('Whenever')).toBeNull();
    expect(screen.getByRole('button', { name: '#work' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('tapping a pinned chip sets the filter', () => {
    mount(TodayPage);
    fireEvent.click(screen.getByRole('button', { name: '#work' }));
    expect(pen.setTagFilter).toHaveBeenCalledWith('work');
  });
});

describe('Upcoming', () => {
  it('lists only the days that have tasks', () => {
    mount(UpcomingPage);
    const days = screen.getAllByRole('heading', { level: 2 }).map((h) => h.getAttribute('aria-label'));
    expect(days).toEqual(['Tomorrow, Wednesday 30 September', 'Friday 2 October']);
  });
});

describe('Done', () => {
  it('one tap on the square puts a task back on the list', () => {
    mount(DonePage);
    fireEvent.click(screen.getByRole('checkbox', { name: /not done: finished/i }));
    expect(pen.toggleDone).toHaveBeenCalledWith(expect.objectContaining({ content: 'Finished' }));
  });

  it('searches what is done', () => {
    mount(DonePage);
    fireEvent.change(screen.getByRole('searchbox', { name: /search done tasks/i }), { target: { value: 'zzz' } });
    expect(screen.queryByText('Finished')).toBeNull();
    expect(screen.getByText(/nothing done matches/i)).toBeInTheDocument();
  });
});
