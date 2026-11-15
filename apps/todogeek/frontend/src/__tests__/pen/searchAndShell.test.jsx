/** Search's clear button and done cap (Tier 6), and scroll-to-top on tabs (3.20). */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createTodoTheme } from '../../theme/theme';
import { filterByTag } from '../../utils/penViews';

process.env.TZ = 'America/Chicago';
const pen = {};
vi.mock('../../context/PenContext', () => ({ usePen: () => pen }));
vi.mock('../../hooks/usePinnedTags', () => ({ default: () => ({ pinned: [], toggle: vi.fn(), setPinned: vi.fn(), loaded: true }) }));
const { default: SearchPage, DONE_CAP } = await import('../../pages/SearchPage');
const { default: MobileTabBar } = await import('../../components/layout/MobileTabBar');
const { PenFrame } = await import('../../components/layout/AppShell');

const now = new Date(2026, 9, 29, 10, 0);
const theme = createTodoTheme('light');
const done = (i) => ({ id: `d${i}`, content: `report ${i}`, status: 'completed', completedAt: new Date(2026, 9, 1, 9, i % 60).toISOString(), tags: [], dueDate: null });

function setPen(corpus) {
  Object.assign(pen, {
    loaded: true, now, corpus, visible: filterByTag(corpus, null), settling: new Set(), tagFilter: null,
    setTagFilter: vi.fn(), setHelpOpen: vi.fn(), toggleDone: vi.fn(), moveTo: vi.fn(), moveToTomorrow: vi.fn(),
    remove: vi.fn(), save: vi.fn(), add: vi.fn(),
  });
}

describe('Search', () => {
  it('says when the done matches are capped, not silently', () => {
    setPen(Array.from({ length: DONE_CAP + 7 }, (_, i) => done(i)));
    render(<MemoryRouter initialEntries={['/search?q=report']}><ThemeProvider theme={theme}><SearchPage /></ThemeProvider></MemoryRouter>);
    expect(screen.getByText(new RegExp(`Showing the newest ${DONE_CAP} of ${DONE_CAP + 7} done matches`))).toBeInTheDocument();
  });
  it('has no cap line under the cap', () => {
    setPen([done(1), done(2)]);
    render(<MemoryRouter initialEntries={['/search?q=report']}><ThemeProvider theme={theme}><SearchPage /></ThemeProvider></MemoryRouter>);
    expect(screen.queryByText(/Showing the newest/)).toBeNull();
  });
  it('clears with our own button (the native one is blue)', () => {
    setPen([done(1)]);
    render(<MemoryRouter initialEntries={['/search?q=report']}><ThemeProvider theme={theme}><SearchPage /></ThemeProvider></MemoryRouter>);
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('report');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });
});

describe('each tab opens at its top (3.20)', () => {
  const Go = () => { const go = useNavigate(); return <button onClick={() => go('/upcoming')}>go</button>; };
  it('a route change scrolls the page frame to the top', () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    render(
      <MemoryRouter initialEntries={['/today']}>
        <ThemeProvider theme={theme}><PenFrame><Go /></PenFrame></ThemeProvider>
      </MemoryRouter>,
    );
    expect(scrollTo).not.toHaveBeenCalled(); // not on first paint
    fireEvent.click(screen.getByText('go'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
  it('tapping the ACTIVE tab scrolls to the top; another tab navigates', () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    render(
      <MemoryRouter initialEntries={['/today']}>
        <ThemeProvider theme={theme}>
          <main data-pen-frame />
          <Routes><Route path="*" element={<MobileTabBar />} /></Routes>
        </ThemeProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    scrollTo.mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'Upcoming' }));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
