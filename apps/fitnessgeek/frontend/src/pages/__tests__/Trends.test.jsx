import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

// Counts mounts, so a test can prove the Food view is not thrown away and
// fetched again when the tabs arrive.
const foodMounts = vi.fn();
vi.mock('../Reports.jsx', () => ({
  default: function FoodStub({ embedded, watch }) {
    React.useEffect(() => { foodMounts(); }, []);
    return <div data-testid="p-food" data-watch={String(watch)}>{String(embedded)}</div>;
  },
}));
vi.mock('../Activity.jsx', () => ({ default: () => <div data-testid="p-activity" /> }));
vi.mock('../HealthDashboard.jsx', () => ({ default: () => <div data-testid="p-health" /> }));

const getSettings = vi.fn();
vi.mock('../../services/apiService', () => ({ apiService: { get: (...a) => getSettings(...a) } }));

import Trends from '../Trends.jsx';

const WATCH = { success: true, data: { influxEnabled: false, garmin: { enabled: true } } };
const NO_WATCH = { success: true, data: { influxEnabled: false, garmin: { enabled: false } } };

const Where = () => {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}{l.search}{l.hash}</div>;
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
const tabs = () => screen.queryByRole('tablist', { name: 'Trends sections' });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  getSettings.mockResolvedValue(WATCH);
});

describe('Trends, with a watch connected', () => {
  it('reads the answer from the settings the app already loads', async () => {
    setup('/trends');
    await screen.findByRole('tablist', { name: 'Trends sections' });
    expect(getSettings).toHaveBeenCalledWith('/user/settings');
  });

  it('defaults to Food, embedded, under the three tabs', async () => {
    setup('/trends');
    await only('p-food');
    expect(screen.getByTestId('p-food')).toHaveTextContent('true');
    expect(await screen.findByRole('tablist', { name: 'Trends sections' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Food', 'Activity', 'Health']);
    expect(screen.getByRole('tab', { name: 'Food' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('trends-watch-line')).toBeNull();
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
    await userEvent.click(await screen.findByRole('tab', { name: 'Activity' }));
    await only('p-activity');
    expect(screen.getByTestId('where').textContent).toContain('tab=activity');
    expect(screen.getByTestId('where').textContent).toContain('day=2026-11-01');
  });

  it('the watch-data switch alone (no Garmin login) also counts as a watch', async () => {
    getSettings.mockResolvedValue({ success: true, data: { influxEnabled: true, garmin: { enabled: false } } });
    setup('/trends');
    expect(await screen.findByRole('tablist', { name: 'Trends sections' })).toBeInTheDocument();
  });
});

describe('Trends, with no watch', () => {
  beforeEach(() => getSettings.mockResolvedValue(NO_WATCH));

  it('is the Food view alone: no tab bar, and one quiet line at the foot that links to Settings', async () => {
    setup('/trends');
    await only('p-food');
    const line = await screen.findByTestId('trends-watch-line');
    expect(line).toHaveTextContent('Have a Garmin watch? Connect it in Settings to see activity, sleep and heart rate here.');
    expect(line).toHaveAttribute('href', '/settings#devices');
    expect(tabs()).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    // After the Food view, not above it.
    expect(screen.getByTestId('p-food').compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The Food view is told, so its body section leaves the watch cards out.
    expect(screen.getByTestId('p-food')).toHaveAttribute('data-watch', 'false');
  });

  it.each([
    ['activity', 'Connect a Garmin watch to see steps, sleep, heart rate and workouts here.'],
    ['health', 'Connect a Garmin watch to see heart rate, sleep and recovery here.'],
  ])('a link to ?tab=%s lands on one friendly card, not silently on Food', async (tab, copy) => {
    setup(`/trends?tab=${tab}`);
    const card = await screen.findByTestId('connect-watch');
    expect(card).toHaveTextContent('Connect a Garmin watch');
    expect(card).toHaveTextContent(copy);
    expect(screen.getByRole('link', { name: 'Connect in Settings' })).toHaveAttribute('href', '/settings#devices');
    expect(screen.queryByTestId('p-food')).toBeNull();
    expect(screen.queryByTestId('p-activity')).toBeNull();
    expect(screen.queryByTestId('p-health')).toBeNull();
    expect(tabs()).toBeNull();
    // And a way on to what she can see.
    await userEvent.click(screen.getByRole('link', { name: 'See your food trends' }));
    await only('p-food');
    expect(screen.getByTestId('where')).toHaveTextContent('/trends');
  });
});

describe('Trends, while the answer is on its way', () => {
  it('shows Food with no tabs, then ADDS the tabs without mounting Food again', async () => {
    let answer;
    getSettings.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    setup('/trends');
    await only('p-food');
    expect(tabs()).toBeNull();
    expect(screen.queryByTestId('trends-watch-line')).toBeNull();
    // Not known yet, so nothing is hidden inside Food on a guess.
    expect(screen.getByTestId('p-food')).toHaveAttribute('data-watch', 'undefined');
    await act(async () => { answer(WATCH); });
    expect(await screen.findByRole('tablist', { name: 'Trends sections' })).toBeInTheDocument();
    expect(screen.getByTestId('p-food')).toBeInTheDocument();
    expect(foodMounts).toHaveBeenCalledTimes(1);
  });

  it('a link to a watch tab holds the space: neither Food nor the connect card flashes up', async () => {
    getSettings.mockReturnValue(new Promise(() => {}));
    setup('/trends?tab=health');
    await waitFor(() => expect(getSettings).toHaveBeenCalled());
    expect(screen.queryByTestId('p-food')).toBeNull();
    expect(screen.queryByTestId('p-health')).toBeNull();
    expect(screen.queryByTestId('connect-watch')).toBeNull();
    expect(tabs()).toBeNull();
  });

  it('remembers the last answer on this device, so a watch owner gets the tabs at once next time', async () => {
    const first = setup('/trends');
    await screen.findByRole('tablist', { name: 'Trends sections' });
    first.unmount();
    getSettings.mockReturnValue(new Promise(() => {}));
    setup('/trends?tab=activity');
    await only('p-activity');
    expect(tabs()).not.toBeNull();
  });
});

describe('Trends, when the setting cannot be read', () => {
  it('shows the tabs: a failed read must never hide a watch owner’s data', async () => {
    getSettings.mockRejectedValue(new Error('Request failed with status code 502'));
    setup('/trends?tab=health');
    await only('p-health');
    expect(tabs()).not.toBeNull();
    expect(screen.queryByTestId('trends-watch-line')).toBeNull();
    expect(screen.queryByTestId('connect-watch')).toBeNull();
  });

  it('even when this device last saw "no watch"', async () => {
    window.localStorage.setItem('fitnessgeek.watchConnected', '0');
    getSettings.mockRejectedValue(new Error('boom'));
    setup('/trends');
    expect(await screen.findByRole('tablist', { name: 'Trends sections' })).toBeInTheDocument();
  });

  it('an answer with no settings in it is not a "no"', async () => {
    getSettings.mockResolvedValue({ success: true, data: null });
    setup('/trends');
    expect(await screen.findByRole('tablist', { name: 'Trends sections' })).toBeInTheDocument();
  });
});
