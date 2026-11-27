import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('../Reports.jsx', () => ({ default: ({ embedded }) => <div data-testid="p-food">{String(embedded)}</div> }));
vi.mock('../Activity.jsx', () => ({ default: () => <div data-testid="p-activity" /> }));
vi.mock('../HealthDashboard.jsx', () => ({ default: () => <div data-testid="p-health" /> }));

import Trends from '../Trends.jsx';

const Where = () => {
  const l = useLocation();
  return <div data-testid="where">{l.search}</div>;
};
const setup = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Trends />
      <Where />
    </MemoryRouter>,
  );
const only = async (id) => {
  expect(await screen.findByTestId(id)).toBeInTheDocument();
  for (const other of ['p-food', 'p-activity', 'p-health'].filter((x) => x !== id)) {
    expect(screen.queryByTestId(other)).toBeNull();
  }
};

describe('Trends', () => {
  it('defaults to Food, embedded', async () => {
    setup('/trends');
    await only('p-food');
    expect(screen.getByTestId('p-food')).toHaveTextContent('true');
    expect(screen.getByRole('tablist', { name: 'Trends sections' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Food' })).toHaveAttribute('aria-selected', 'true');
  });

  it('selects from ?tab=', async () => {
    setup('/trends?tab=health');
    await only('p-health');
    expect(screen.getByRole('tab', { name: 'Health' })).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to Food for an unknown tab', async () => {
    setup('/trends?tab=nope');
    await only('p-food');
  });

  it('switching updates the URL, keeps other params, mounts only that page', async () => {
    setup('/trends?day=2026-11-01');
    await only('p-food');
    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    await only('p-activity');
    expect(screen.getByTestId('where').textContent).toContain('tab=activity');
    expect(screen.getByTestId('where').textContent).toContain('day=2026-11-01');
  });
});
