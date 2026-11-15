/** Today's page, wave 2: loading counts, add-box focus, phone Reorder mode, a failed load. */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createTodoTheme } from '../../theme/theme';
import { filterByTag } from '../../utils/penViews';

process.env.TZ = 'America/Chicago';
const pen = {};
vi.mock('../../context/PenContext', () => ({ usePen: () => pen }));
vi.mock('../../hooks/usePinnedTags', () => ({ default: () => ({ pinned: [], toggle: vi.fn(), setPinned: vi.fn(), loaded: true }) }));
vi.mock('../../hooks/useDailyOrder', () => ({ default: () => ({ ids: [], loaded: true, save: vi.fn() }) }));
const { default: TodayPage } = await import('../../pages/TodayPage');

const now = new Date(2026, 9, 29, 10, 0);
const today = '2026-10-29T00:00:00.000Z';
const t = (id, over = {}) => ({ id, content: id, status: 'pending', tags: [], dueDate: today, createdAt: '2026-10-01T00:00:00.000Z', ...over });

function setPen(corpus, extra = {}) {
  Object.keys(pen).forEach((k) => delete pen[k]);
  Object.assign(pen, {
    loaded: true, now, corpus, visible: filterByTag(corpus, null), settling: new Set(), tagFilter: null,
    setTagFilter: vi.fn(), setHelpOpen: vi.fn(), toggleDone: vi.fn(), moveTo: vi.fn(), moveToTomorrow: vi.fn(),
    moveAllToToday: vi.fn(), remove: vi.fn(), save: vi.fn(), add: vi.fn(), refresh: vi.fn(), ...extra,
  });
}
const ui = () => (
  <MemoryRouter><ThemeProvider theme={createTodoTheme('light')}><TodayPage /></ThemeProvider></MemoryRouter>
);

const realMatchMedia = window.matchMedia;
/** `desktop`: wide + hover + fine pointer; otherwise a phone. */
const device = (kind) => {
  window.matchMedia = (query) => {
    const wide = kind === 'desktop';
    const matches = /max-width/.test(query) ? !wide : /any-hover|any-pointer: fine|pointer: fine/.test(query) ? wide : false;
    return { matches, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false };
  };
};
beforeEach(() => { device('desktop'); });
afterEach(() => { window.matchMedia = realMatchMedia; });

describe('the counts', () => {
  it('say nothing while the list is loading (not "0 to do · 0 done")', () => {
    setPen([], { loaded: false });
    render(ui());
    expect(document.querySelector('[data-desk-counts]').textContent.trim()).toBe('');
    expect(screen.queryByText(/0 to do/)).toBeNull();
  });
  it('count to-dos only: a note and an event are not to do', () => {
    setPen([t('a'), t('b', { signifier: '-' }), t('c', { signifier: '@' })]);
    render(ui());
    expect(screen.getByText('1 to do · 0 done')).toBeInTheDocument();
  });
});

describe('a failed load', () => {
  it('is said with a Retry, not drawn as "Nothing due today"', () => {
    const refresh = vi.fn();
    setPen([], { loadError: new Error('503'), refresh });
    render(ui());
    expect(screen.queryByText(/nothing due today/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalled();
  });
});

describe('the add box takes focus once, not every time Today empties (4.13)', () => {
  it('does not steal focus when the last task is ticked off', () => {
    setPen([t('a')]);
    const { rerender } = render(ui());
    expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'New task' }));
    setPen([t('a', { status: 'completed', completedAt: new Date(2026, 9, 29, 9).toISOString() })]);
    rerender(ui());
    expect(screen.getByText('0 to do · 1 done')).toBeInTheDocument();
    expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'New task' }));
  });
  it('still focuses on opening an empty Today on a desktop', () => {
    setPen([]);
    render(ui());
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'New task' }));
  });
  it('is sticky on a desktop', () => {
    setPen([t('a')]);
    render(ui());
    expect(document.querySelector('[data-add-sticky]')).not.toBeNull();
  });
});

describe('phone: grips behind Reorder (3.16)', () => {
  it('has none until Reorder is pressed', () => {
    device('phone');
    setPen([t('a'), t('b')]);
    render(ui());
    const today = screen.getByRole('region', { name: 'Today' });
    expect(today.querySelector('[data-drag-handle]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reorder' }));
    expect(within(today).getAllByRole('button', { name: /^Move / })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Done reordering' }));
    expect(today.querySelector('[data-drag-handle]')).toBeNull();
  });
  it('the add box is docked and stays when an editor is open', () => {
    device('phone');
    setPen([t('a')]);
    render(ui());
    fireEvent.click(screen.getByRole('button', { name: /^a$/ }));
    expect(document.querySelector('[data-add-dock]')).not.toBeNull();
  });
});
