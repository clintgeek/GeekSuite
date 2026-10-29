/**
 * Today's drag-to-reorder, on the page (DOCS/SORTING_RULES.md § "Manual
 * order (Today)"): a grip on every Today and Anytime row (not Carried over,
 * not a row that is settling); the saved order is what the page shows;
 * Alt+↑/↓ and the grip's arrows move a task within its section and save the
 * whole day's order; a pinned tag filter moves only what it shows; each move
 * is said in a polite live region — never a private task's words.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createTodoTheme } from '../../theme/theme';
import { filterByTag } from '../../utils/penViews';

process.env.TZ = 'America/Chicago';

const pen = {};
const daily = { ids: [], loaded: true, save: vi.fn() };
let dailyKeys = [];
vi.mock('../../context/PenContext', () => ({ usePen: () => pen }));
vi.mock('../../hooks/usePinnedTags', () => ({ default: () => ({ pinned: ['work'], toggle: vi.fn(), setPinned: vi.fn(), loaded: true }) }));
vi.mock('../../hooks/useDailyOrder', () => ({ default: (key) => { dailyKeys.push(key); return daily; } }));

const { default: TodayPage } = await import('../../pages/TodayPage');

const now = new Date(2026, 9, 29, 10, 0);
const today = '2026-10-29T00:00:00.000Z';
const t = (id, over = {}) => ({ id, content: id, status: 'pending', tags: [], dueDate: today, createdAt: '2026-10-01T00:00:00.000Z', ...over });

// By the normal rule: High, Medium, none — and Anytime: a1 (High), a2.
const CORPUS = [
  t('Late one', { dueDate: '2026-10-27T00:00:00.000Z' }),
  t('Buy milk'),
  t('Call Dana', { priority: 1, tags: ['work'] }),
  t('Write notes', { priority: 2 }),
  t('Fix the fence', { tags: ['work'] }),
  t('a1', { dueDate: null, priority: 1 }),
  t('a2', { dueDate: null }),
];

function setPen({ tagFilter = null, corpus = CORPUS, settling = new Set() } = {}) {
  Object.assign(pen, {
    loaded: true, now, corpus, visible: filterByTag(corpus, tagFilter), settling, tagFilter,
    setTagFilter: vi.fn(), setHelpOpen: vi.fn(), toggleDone: vi.fn(), moveTo: vi.fn(),
    moveToTomorrow: vi.fn(), moveAllToToday: vi.fn(), remove: vi.fn(), save: vi.fn(), add: vi.fn(),
  });
}

const mount = () => render(
  <MemoryRouter>
    <ThemeProvider theme={createTodoTheme('light')}><TodayPage /></ThemeProvider>
  </MemoryRouter>,
);

const rowsIn = (name) => within(screen.getByRole('region', { name }))
  .getAllByRole('listitem')
  .map((li) => li.getAttribute('data-row-id'));
const key = (k, extra = {}) => act(() => { fireEvent.keyDown(window, { key: k, ...extra }); });
const said = () => document.querySelector('[data-order-said]').textContent;

beforeEach(() => {
  setPen();
  daily.ids = [];
  daily.save = vi.fn();
  dailyKeys = [];
});

describe('the grip', () => {
  it('every Today and Anytime row has one — "Move <words>" — and Carried over has none', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /1 carried over/i }));
    const today = screen.getByRole('region', { name: 'Today' });
    expect(within(today).getByRole('button', { name: 'Move Buy milk' })).toBeInTheDocument();
    expect(within(today).getAllByRole('button', { name: /^Move / })).toHaveLength(4);
    const anytime = screen.getByRole('region', { name: 'Anytime' });
    expect(within(anytime).getAllByRole('button', { name: /^Move / })).toHaveLength(2);
    const late = screen.getByRole('region', { name: 'Carried over' });
    expect(late.querySelector('[data-drag-handle]')).toBeNull();
    expect(within(late).getByText('Late one')).toBeInTheDocument();
  });

  it('a row that is settling (ticked, about to leave) has no grip', () => {
    const ticked = { ...CORPUS[1], status: 'completed', completedAt: now.toISOString() };
    setPen({ corpus: CORPUS.map((x) => (x.id === ticked.id ? ticked : x)), settling: new Set([ticked.id]) });
    mount();
    expect(screen.getByText('Buy milk').closest('[data-row-id]')).toHaveAttribute('data-crossed', 'true');
    expect(screen.queryByRole('button', { name: 'Move Buy milk' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Move Call Dana' })).toBeInTheDocument();
  });

  it('tapping the words still opens the row', () => {
    mount();
    const words = screen.getByText('Buy milk').closest('button');
    fireEvent.click(words);
    expect(words).toHaveAttribute('aria-expanded', 'true');
    expect(daily.save).not.toHaveBeenCalled();
  });
});

describe('the saved order', () => {
  it('reads the order for the page’s local day', () => {
    mount();
    expect(dailyKeys.at(-1)).toBe('2026-10-29');
  });

  it('with none saved, the normal rule', () => {
    mount();
    expect(rowsIn('Today')).toEqual(['Call Dana', 'Write notes', 'Buy milk', 'Fix the fence']);
    expect(rowsIn('Anytime')).toEqual(['a1', 'a2']);
  });

  it('a saved order is what the page shows', () => {
    daily.ids = ['Fix the fence', 'Buy milk', 'Call Dana', 'Write notes', 'a2', 'a1'];
    mount();
    expect(rowsIn('Today')).toEqual(['Fix the fence', 'Buy milk', 'Call Dana', 'Write notes']);
    expect(rowsIn('Anytime')).toEqual(['a2', 'a1']);
  });
});

describe('moving by keys', () => {
  it('Alt+↓ moves the selected task down one, saves the whole day, and says so', () => {
    mount();
    key('j'); // Call Dana
    key('ArrowDown', { altKey: true });
    expect(daily.save).toHaveBeenCalledTimes(1);
    expect(daily.save).toHaveBeenCalledWith(['Write notes', 'Call Dana', 'Buy milk', 'Fix the fence', 'a1', 'a2']);
    expect(said()).toBe('Moved ‘Call Dana’ to position 2 of 4.');
  });

  it('Alt+↑ at the top of a section does nothing; it never crosses into another section', () => {
    mount();
    key('j'); // Call Dana, first of Today
    key('ArrowUp', { altKey: true });
    expect(daily.save).not.toHaveBeenCalled();
    key('j'); key('j'); key('j'); // Fix the fence, last of Today
    key('ArrowDown', { altKey: true });
    expect(daily.save).not.toHaveBeenCalled();
    key('j'); // a1, first of Anytime
    key('ArrowDown', { altKey: true });
    expect(daily.save).toHaveBeenLastCalledWith(['Call Dana', 'Write notes', 'Buy milk', 'Fix the fence', 'a2', 'a1']);
    expect(said()).toBe('Moved ‘a1’ to position 2 of 2.');
  });

  it('plain arrows on a focused grip move its task', () => {
    mount();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Move Buy milk' }), { key: 'ArrowUp' });
    expect(daily.save).toHaveBeenCalledWith(['Call Dana', 'Buy milk', 'Write notes', 'Fix the fence', 'a1', 'a2']);
    expect(said()).toBe('Moved ‘Buy milk’ to position 2 of 4.');
  });

  it('a carried-over task does not move', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /1 carried over/i }));
    key('j'); // Late one
    key('ArrowDown', { altKey: true });
    expect(daily.save).not.toHaveBeenCalled();
  });

  it('a settling task does not move', () => {
    const ticked = { ...CORPUS[2], status: 'completed', completedAt: now.toISOString() };
    setPen({ corpus: CORPUS.map((x) => (x.id === ticked.id ? ticked : x)), settling: new Set([ticked.id]) });
    mount();
    key('j'); // Call Dana, crossed
    key('ArrowDown', { altKey: true });
    expect(daily.save).not.toHaveBeenCalled();
  });

  it('with a pinned tag on, only the shown tasks trade places; the hidden ones keep theirs', () => {
    setPen({ tagFilter: 'work' });
    mount();
    expect(rowsIn('Today')).toEqual(['Call Dana', 'Fix the fence']);
    key('j');
    key('ArrowDown', { altKey: true });
    // Whole Today was: Call Dana, Write notes, Buy milk, Fix the fence.
    expect(daily.save).toHaveBeenCalledWith(['Fix the fence', 'Write notes', 'Buy milk', 'Call Dana', 'a1', 'a2']);
    expect(said()).toBe('Moved ‘Call Dana’ to position 2 of 2.');
  });

  it('a private task is announced as "Private task"', () => {
    setPen({ corpus: [...CORPUS, t('Fire Jane', { private: true, priority: 1, createdAt: '2026-09-01T00:00:00.000Z' })] });
    mount();
    key('j'); // Fire Jane: High and older than Call Dana
    key('ArrowDown', { altKey: true });
    expect(said()).toBe('Moved ‘Private task’ to position 2 of 5.');
    expect(said()).not.toContain('Jane');
  });

  it('the live region is polite', () => {
    mount();
    const region = document.querySelector('[data-order-said]');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('role', 'status');
  });
});
