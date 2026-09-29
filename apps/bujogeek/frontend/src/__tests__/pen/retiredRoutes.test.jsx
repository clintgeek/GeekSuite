/**
 * Every retired screen's URL lands on Today (SIMPLE_PLAN "Out of the UI"),
 * and the three views and search are the only routes left.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('../../context/PenContext.jsx', () => ({ usePen: () => ({ helpOpen: false, setHelpOpen: vi.fn() }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false, isAuthenticated: true }) }));
vi.mock('../../components/ProtectedRoute', () => ({ default: ({ children }) => children }));
const Here = ({ name }) => { const loc = useLocation(); return <div data-testid="page">{name} {loc.pathname}</div>; };
vi.mock('../../pages/TodayPage', () => ({ default: () => <Here name="TODAY" /> }));
vi.mock('../../pages/UpcomingPage', () => ({ default: () => <Here name="UPCOMING" /> }));
vi.mock('../../pages/DonePage', () => ({ default: () => <Here name="DONE" /> }));
vi.mock('../../pages/SearchPage', () => ({ default: () => <Here name="SEARCH" /> }));
vi.mock('../../components/pen/HelpSheet', () => ({ default: () => null }));

const { PenRoutes } = await import('../../App.jsx');

const at = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <PenRoutes user={{ id: 'u1' }} loading={false} />
  </MemoryRouter>,
);

describe('retired screens redirect to Today', () => {
  it.each([
    '/review', '/plan', '/plan/weekly', '/plan/monthly', '/plan/backlog', '/templates', '/templates/new',
    '/tags', '/collections', '/collections/c1', '/habits', '/settings', '/tasks/daily', '/tasks/weekly', '/journal',
    '/blocked', '/backlog', '/migration', '/somewhere-else',
  ])('%s → /today', async (path) => {
    at(path);
    expect(await screen.findByTestId('page')).toHaveTextContent('TODAY /today');
  });
});

describe('the four routes that are left', () => {
  it.each([
    ['/today', 'TODAY /today'],
    ['/upcoming', 'UPCOMING /upcoming'],
    ['/done', 'DONE /done'],
    ['/search', 'SEARCH /search'],
  ])('%s renders its own view', async (path, text) => {
    at(path);
    expect(await screen.findByTestId('page')).toHaveTextContent(text);
  });
});
