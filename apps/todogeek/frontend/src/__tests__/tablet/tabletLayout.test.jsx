/**
 * TodoGeek on a tablet (wave 3, 2026-11-16): the rail, the capped column with
 * the date beside the words, the add box beside the rail, the load error as a
 * proper state, and Today as two panes from 1024 px. Phone and desktop keep
 * what they had.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { GeekShell, GeekNavRail } from '@geeksuite/ui';
import { createTodoTheme } from '../../theme/theme';
import { filterByTag } from '../../utils/penViews';
import { setDevice, resetDevice } from './device';

process.env.TZ = 'America/Chicago';
const pen = {};
vi.mock('../../context/PenContext', () => ({ usePen: () => pen }));
vi.mock('../../hooks/usePinnedTags', () => ({ default: () => ({ pinned: [], toggle: vi.fn(), setPinned: vi.fn(), loaded: true }) }));
vi.mock('../../hooks/useDailyOrder', () => ({ default: () => ({ ids: [], loaded: true, save: vi.fn() }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../components/layout/TopBar', () => ({ default: () => <header data-testid="topbar" /> }));
vi.mock('../../hooks/usePushReminders', () => ({ default: () => ({ status: 'unsupported' }) }));

const { default: AppShell } = await import('../../components/layout/AppShell');
const { default: TodayPage } = await import('../../pages/TodayPage');
const { default: UpcomingPage } = await import('../../pages/UpcomingPage');

const now = new Date(2026, 10, 16, 15, 0);
const theme = createTodoTheme('light');
const at = (h, m = 0) => new Date(2026, 10, 16, h, m).toISOString();
const t = (id, extra = {}) => ({ id, content: `task ${id}`, status: 'pending', tags: [], dueDate: null, priority: null, ...extra });

function setPen(corpus, extra = {}) {
  Object.assign(pen, {
    loaded: true, loadError: null, now, corpus, visible: filterByTag(corpus, null), settling: new Set(), tagFilter: null,
    pendingTag: null, dismissPendingTag: vi.fn(),
    setTagFilter: vi.fn(), setHelpOpen: vi.fn(), toggleDone: vi.fn(), moveTo: vi.fn(), moveToTomorrow: vi.fn(),
    moveAllToToday: vi.fn(), remove: vi.fn(), save: vi.fn(), add: vi.fn(), refresh: vi.fn(), ...extra,
  });
}

const inShell = (page, path = '/today') => (
  <MemoryRouter initialEntries={[path]}>
    <ThemeProvider theme={theme}>
      <Routes><Route path="*" element={<AppShell>{page}</AppShell>} /></Routes>
    </ThemeProvider>
  </MemoryRouter>
);

afterEach(() => resetDevice());

describe('navigation: one items array, the device picks the surface', () => {
  it('portrait tablet: the rail, every view on it, no tab bar and no drawer', () => {
    setDevice('tablet');
    render(inShell(<p>page</p>));
    const rail = document.querySelector('[data-geek-nav-rail]');
    expect(rail).not.toBeNull();
    for (const name of ['Today', 'Upcoming', 'Done', 'Search']) {
      expect(within(rail).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(rail).getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('[data-geek-bottom-nav]')).toBeNull();
    expect(document.querySelector('[data-geek-nav]')).toBeNull();
  });
  it('landscape touch tablet keeps the rail', () => {
    setDevice('tablet-land');
    render(inShell(<p>page</p>));
    expect(document.querySelector('[data-geek-nav-rail]')).not.toBeNull();
    expect(document.querySelector('[data-geek-nav="permanent"]')).toBeNull();
  });
  it('phone: tab bar and the drawer, no rail (unchanged)', () => {
    setDevice('phone');
    render(inShell(<p>page</p>));
    expect(document.querySelector('[data-geek-bottom-nav]')).not.toBeNull();
    expect(document.querySelector('[data-geek-nav="temporary"]')).not.toBeNull();
    expect(document.querySelector('[data-geek-nav-rail]')).toBeNull();
  });
  it('desktop: the Red Pen sidebar, no rail, no tab bar (unchanged)', () => {
    setDevice('desktop');
    render(inShell(<p>page</p>));
    const side = document.querySelector('[data-geek-nav="permanent"]');
    expect(side).not.toBeNull();
    expect(within(side).getByRole('link', { name: 'TodoGeek, Today' })).toBeInTheDocument();
    expect(document.querySelector('[data-geek-nav-rail]')).toBeNull();
    expect(document.querySelector('[data-geek-bottom-nav]')).toBeNull();
  });
  it('tapping the rail item you are on scrolls to the top', () => {
    setDevice('tablet');
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    render(inShell(<p>page</p>));
    const rail = document.querySelector('[data-geek-nav-rail]');
    fireEvent.click(within(rail).getByRole('link', { name: 'Today' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});

describe('portrait tablet Today', () => {
  const tasks = () => [
    t('a', { content: 'Write the retro notes', dueDate: at(17), tags: ['work'] }),
    t('b', { content: 'Pick up the dry cleaning', dueDate: at(16) }),
  ];

  it('puts the time right after the words and tags, inside the row\'s one button', () => {
    setDevice('tablet');
    setPen(tasks());
    render(inShell(<TodayPage />));
    const words = screen.getByRole('button', { name: /^Write the retro notes/ });
    const when = words.querySelector('[data-row-when="inline"]');
    expect(when).not.toBeNull();
    expect(when.textContent).toMatch(/5pm/);
    expect(document.querySelector('[data-row-when="column"]')).toBeNull();
  });
  it('caps the page column at 640px', () => {
    setDevice('tablet');
    setPen(tasks());
    render(inShell(<TodayPage />));
    expect(getComputedStyle(document.querySelector('[data-pen-page]')).maxWidth).toBe('640px');
  });
  it('docks the add box beside the rail, not under it', () => {
    setDevice('tablet');
    setPen(tasks());
    render(inShell(<TodayPage />));
    const dock = document.querySelector('[data-add-dock]');
    expect(dock).not.toBeNull();
    expect(getComputedStyle(dock).left).toBe('72px');
    expect(within(dock).getByRole('textbox', { name: 'New task' })).toBeInTheDocument();
    expect(getComputedStyle(dock.querySelector('[data-add-dock-column]')).maxWidth).toBe('640px');
  });
  it('tells the toast stack how tall the dock is, and forgets it when the dock goes', () => {
    setDevice('tablet');
    setPen(tasks());
    const real = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function rect() {
      return this.hasAttribute?.('data-add-dock')
        ? { top: 1180, bottom: 1280, left: 72, right: 800, width: 728, height: 100, x: 72, y: 1180 }
        : real.call(this);
    };
    try {
      const { unmount } = render(inShell(<TodayPage />));
      expect(document.documentElement.style.getPropertyValue('--pen-dock-clear')).toBe('108px');
      unmount();
      expect(document.documentElement.style.getPropertyValue('--pen-dock-clear')).toBe('');
    } finally {
      Element.prototype.getBoundingClientRect = real;
    }
  });
  it('shows the grips without a Reorder toggle (a 590px row has room)', () => {
    setDevice('tablet');
    setPen(tasks());
    render(inShell(<TodayPage />));
    expect(screen.queryByRole('button', { name: 'Reorder' })).toBeNull();
    const today = screen.getByRole('region', { name: 'Today' });
    expect(within(today).getAllByRole('button', { name: /^Move / })).toHaveLength(2);
  });
  it('is one pane: no two-pane split', () => {
    setDevice('tablet');
    setPen(tasks());
    render(inShell(<TodayPage />));
    expect(document.querySelector('[data-geek-two-pane]')).toBeNull();
  });
  it('a failed load is a centred state with Retry, not a line top-left', () => {
    setDevice('tablet');
    const refresh = vi.fn();
    setPen([], { loadError: new Error('503'), loaded: false, refresh });
    render(inShell(<TodayPage />));
    const state = screen.getByRole('alert');
    expect(state).toHaveAttribute('data-geek-load-error');
    expect(state).toHaveTextContent('Couldn’t reach your list.');
    fireEvent.click(within(state).getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalled();
  });
  it('the phone keeps its own load-error line', () => {
    setDevice('phone');
    setPen([], { loadError: new Error('503'), loaded: false });
    render(inShell(<TodayPage />));
    expect(screen.getByRole('alert')).not.toHaveAttribute('data-geek-load-error');
  });
  it('the phone keeps the time under the words and the full-width dock', () => {
    setDevice('phone');
    setPen(tasks());
    render(inShell(<TodayPage />));
    expect(document.querySelector('[data-row-when="inline"]')).toBeNull();
    expect(document.querySelector('[data-row-when="column"]')).not.toBeNull();
    expect(getComputedStyle(document.querySelector('[data-add-dock]')).left).toBe('0px');
  });
});

describe('portrait tablet Upcoming', () => {
  it('the time sits next to the words', () => {
    setDevice('tablet');
    setPen([t('u', { content: 'Dentist', dueDate: new Date(2026, 10, 18, 9, 0).toISOString() })]);
    render(inShell(<UpcomingPage />, '/upcoming'));
    const words = screen.getByRole('button', { name: /^Dentist/ });
    expect(words.querySelector('[data-row-when="inline"]')).not.toBeNull();
  });
});

describe('two-pane Today from 1024 px', () => {
  const tasks = () => [t('a', { content: 'Write the retro notes' }), t('b', { content: 'Pick up the dry cleaning' })];

  it('landscape tablet: list | task; a tapped task opens in the right pane, the list stays', () => {
    setDevice('tablet-land');
    setPen(tasks());
    render(inShell(<TodayPage />));
    expect(document.querySelector('[data-geek-two-pane="split"]')).not.toBeNull();
    const list = screen.getByRole('region', { name: 'Today’s list' });
    const detail = screen.getByRole('region', { name: 'Task' });
    expect(within(detail).getByText('Tap a task to open it here.')).toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: /^Write the retro notes/ }));
    const form = within(detail).getByRole('form', { name: 'Edit Write the retro notes' });
    expect(within(form).getByLabelText('Task')).toHaveValue('Write the retro notes');
    expect(within(list).queryByRole('form', { name: /^Edit / })).toBeNull();
    // The list is still there beside it.
    expect(within(list).getByRole('button', { name: /^Pick up the dry cleaning/ })).toBeInTheDocument();
    // The add box is in the list pane (sticky), not docked over both panes.
    expect(document.querySelector('[data-add-dock]')).toBeNull();
    expect(list.querySelector('[data-add-sticky]')).not.toBeNull();
  });
  it('the open row says which pane it controls, and that element exists', () => {
    setDevice('tablet-land');
    setPen(tasks());
    render(inShell(<TodayPage />));
    const row = screen.getByRole('button', { name: /^Write the retro notes/ });
    fireEvent.click(row);
    const id = row.getAttribute('aria-controls');
    expect(id).toBeTruthy();
    const target = document.getElementById(id);
    expect(target).not.toBeNull();
    expect(within(target).getByRole('form', { name: 'Edit Write the retro notes' })).toBeInTheDocument();
  });
  it('desktop: one pane, as before — two panes are held back to the tablet', () => {
    setDevice('desktop');
    setPen(tasks());
    render(inShell(<TodayPage />));
    expect(document.querySelector('[data-geek-two-pane="split"]')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Task' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Write the retro notes/ })).toBeInTheDocument();
  });
  it('Cancel puts the placeholder back', () => {
    setDevice('tablet-land');
    setPen(tasks());
    render(inShell(<TodayPage />));
    const list = screen.getByRole('region', { name: 'Today’s list' });
    fireEvent.click(within(list).getByRole('button', { name: /^Pick up the dry cleaning/ }));
    const detail = screen.getByRole('region', { name: 'Task' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Cancel' }));
    expect(within(detail).getByText('Tap a task to open it here.')).toBeInTheDocument();
  });
});

// Keep the imports honest: the shell pieces the app uses are the suite's.
it('uses the suite rail and shell', () => {
  expect(GeekNavRail).toBeTypeOf('object');
  expect(GeekShell).toBeTypeOf('function');
});
