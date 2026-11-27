/**
 * Trends › Activity: what a person sees when there is no watch, when the read
 * fails, and when only part of it fails. A failed read is never drawn as "no
 * activities", and a person with no watch never sees empty panels.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const svc = vi.hoisted(() => ({
  getGarminStatus: vi.fn(),
  getGarminDaily: vi.fn(),
  getGarminSleep: vi.fn(),
  getGarminActivities: vi.fn(),
}));
vi.mock('../../services/fitnessGeekService', () => ({ fitnessGeekService: svc }));

const { default: Activity } = await import('../Activity.jsx');

const DAILY = { steps: 8421, activeCalories: 512, restingHR: 54, sleepMinutes: 412, fetchedAt: new Date().toISOString() };
const SLEEP = {
  sleepScore: 78, deepSleepMinutes: 74, lightSleepMinutes: 228, remSleepMinutes: 84, awakeSleepMinutes: 26,
  avgOvernightHrv: 61, hrvStatus: 'BALANCED', bodyBatteryChange: 54, avgSleepStress: 19,
};
const RUN = { activityId: 1, activityName: 'Morning Run', activityType: 'running', duration: 1800, distance: 5000, calories: 320, startTimeLocal: new Date().toISOString() };

const renderPage = () => render(<MemoryRouter><Activity embedded /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  svc.getGarminStatus.mockResolvedValue({ data: { enabled: true } });
  svc.getGarminDaily.mockResolvedValue({ data: DAILY });
  svc.getGarminSleep.mockResolvedValue({ data: SLEEP });
  svc.getGarminActivities.mockResolvedValue({ data: [RUN] });
});

describe('no watch connected', () => {
  it('shows one friendly card and nothing else: no empty panels', async () => {
    svc.getGarminStatus.mockResolvedValue({ data: { enabled: false } });
    renderPage();
    const card = await screen.findByTestId('connect-watch');
    expect(card).toHaveTextContent('Connect a Garmin watch to see steps, sleep, heart rate and workouts here.');
    expect(within(card).getByRole('link', { name: 'Connect Garmin' })).toHaveAttribute('href', '/settings#garmin');
    expect(screen.queryByText('Recent activities')).toBeNull();
    expect(screen.queryByText(/No workouts yet|No recent activities/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(svc.getGarminDaily).not.toHaveBeenCalled();
  });
});

describe('a failed read', () => {
  it('the whole read failing shows the failure and no "no activities" under it', async () => {
    svc.getGarminStatus.mockRejectedValue(new Error('Network Error'));
    renderPage();
    expect(await screen.findByText('Couldn’t load your activity')).toBeInTheDocument();
    expect(screen.queryByText('Recent activities')).toBeNull();
    expect(screen.queryByTestId('activities-empty')).toBeNull();
    expect(screen.queryByText(/Network Error/)).toBeNull();
  });

  it('all three sources failing is the page failing, not three empty cards', async () => {
    svc.getGarminDaily.mockRejectedValue(new Error('boom'));
    svc.getGarminSleep.mockRejectedValue(new Error('boom'));
    svc.getGarminActivities.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Couldn’t load your activity')).toBeInTheDocument();
    expect(screen.queryByTestId('activities-empty')).toBeNull();
  });

  it('activities alone failing says so, and never "No workouts yet"', async () => {
    svc.getGarminActivities.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByTestId('activities-failed')).toHaveTextContent('Couldn’t load your recent activities.');
    expect(screen.getByTestId('activity-partial-failure')).toHaveTextContent('Couldn’t load your recent activities. The rest is up to date.');
    expect(screen.queryByTestId('activities-empty')).toBeNull();
    // The parts that did load are up.
    expect(screen.getByText('Today so far')).toBeInTheDocument();
    // And the retry asks again.
    svc.getGarminActivities.mockResolvedValue({ data: [RUN] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Morning Run')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-partial-failure')).toBeNull();
  });

  it('an honest empty list still says there are no workouts yet', async () => {
    svc.getGarminActivities.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByTestId('activities-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('activities-failed')).toBeNull();
  });
});

describe('connected, and nothing has synced', () => {
  it('one sentence, not empty cards', async () => {
    svc.getGarminDaily.mockResolvedValue(null);
    svc.getGarminSleep.mockResolvedValue(null);
    svc.getGarminActivities.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByText('Nothing from your watch yet')).toBeInTheDocument();
    expect(screen.queryByText('Recent activities')).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });
});

describe('last night’s sleep', () => {
  it('says "Sleep score" once, with no bare "Score" under it', async () => {
    renderPage();
    const card = await screen.findByTestId('activity-sleep');
    expect(within(card).getAllByText('Sleep score')).toHaveLength(1);
    expect(within(card).queryByText('Score')).toBeNull();
    expect(within(card).getByText('78')).toBeInTheDocument();
  });

  it('explains HRV, Body Battery and stress in plain words where they appear', async () => {
    renderPage();
    const card = await screen.findByTestId('activity-sleep');
    expect(card).toHaveTextContent('The tiny changes in time between heartbeats.');
    expect(card).toHaveTextContent('Garmin’s 0–100 energy estimate.');
    expect(card).toHaveTextContent('Lower is calmer.');
    // Garmin's ALL-CAPS status reads as a word.
    expect(card).toHaveTextContent('Balanced');
    expect(card).not.toHaveTextContent('BALANCED');
  });

  it('a Body Battery that fell overnight is not written "+-5"', async () => {
    svc.getGarminSleep.mockResolvedValue({ data: { ...SLEEP, bodyBatteryChange: -5 } });
    renderPage();
    const card = await screen.findByTestId('activity-sleep');
    expect(within(card).getByText('-5')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('+-5');
  });
});
