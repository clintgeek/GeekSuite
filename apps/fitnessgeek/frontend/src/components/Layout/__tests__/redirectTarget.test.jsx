/**
 * Old addresses (DOCS/ONE_APP_PLAN.md §1, §3) land on the new page with the
 * query string they came with: `/food-log?date=…&meal=…` opens that meal on
 * Today, `/reports` opens Trends on Food, `/my-foods` opens Saved foods on
 * Foods.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { redirectTarget } from '../redirectTarget.js';
import RedirectWithQuery from '../RedirectWithQuery.jsx';

describe('redirectTarget', () => {
  it('keeps the query string and the hash', () => {
    expect(redirectTarget('/dashboard', { search: '?date=2026-11-20&meal=dinner', hash: '' })).toBe('/dashboard?date=2026-11-20&meal=dinner');
    expect(redirectTarget('/dashboard', { search: '?add=1', hash: '#x' })).toBe('/dashboard?add=1#x');
  });

  it('adds nothing when there was nothing', () => {
    expect(redirectTarget('/dashboard', { search: '', hash: '' })).toBe('/dashboard');
    expect(redirectTarget('/dashboard')).toBe('/dashboard');
  });

  it('adds the tab the new page needs, beside what the link carried', () => {
    expect(redirectTarget('/trends', { search: '' }, { tab: 'food' })).toBe('/trends?tab=food');
    expect(redirectTarget('/trends', { search: '?range=30' }, { tab: 'activity' })).toBe('/trends?range=30&tab=activity');
    expect(redirectTarget('/saved-foods', { search: '?tab=old' }, { tab: 'foods' })).toBe('/saved-foods?tab=foods');
  });
});

function Where() {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname}{search}</div>;
}

const landFrom = (url) => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/food-log" element={<RedirectWithQuery to="/dashboard" />} />
        <Route path="/health" element={<RedirectWithQuery to="/trends" params={{ tab: 'health' }} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
  return screen.getByTestId('where').textContent;
};

describe('RedirectWithQuery', () => {
  it('/food-log?date=…&meal=… lands on Today with both', () => {
    expect(landFrom('/food-log?date=2026-11-20&meal=dinner')).toBe('/dashboard?date=2026-11-20&meal=dinner');
  });

  it('/health lands on the Health tab of Trends', () => {
    expect(landFrom('/health')).toBe('/trends?tab=health');
  });
});
