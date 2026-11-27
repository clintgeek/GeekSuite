/**
 * Trends › Health: the states before any data, and the one compact day
 * control.
 *
 * The day control replaced a tall header (a big "Today", Yesterday / Today
 * buttons and a date field) that put a third layer of navigation between the
 * tabs and the data on a phone. One row now: previous, the day (which opens
 * the phone's date picker), next; "Today" comes back only once you have left
 * today.
 */
import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('../../services/apiService', () => ({ apiService: { get: (...a) => get(...a) } }));
// Each panel reports the day it was handed, so the test sees the day change.
vi.mock('../../components/IntradayDashboard', () => ({ default: ({ date }) => <div data-testid="panel-day">{date}</div> }));
vi.mock('../../components/SleepAnalysis', () => ({ default: () => <div data-testid="panel-sleep" /> }));
vi.mock('../../components/MealImpactVisualization', () => ({ default: () => <div /> }));
vi.mock('../../components/RecoveryCoach', () => ({ default: () => <div /> }));
vi.mock('../../components/InfluxDBSettings', () => ({
  default: ({ onSettingsChange }) => (
    <button type="button" data-testid="setup-form" onClick={() => onSettingsChange({ influxEnabled: true })}>turn on</button>
  ),
}));

import HealthDashboard from '../HealthDashboard.jsx';
import { localDateString } from '@geeksuite/utils';

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localDateString(d);
};
const renderPage = () => render(<MemoryRouter><HealthDashboard embedded /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { influxEnabled: true } });
});

describe('the day control', () => {
  it('opens on Today, with Next day disabled and no "Today" button to press', async () => {
    renderPage();
    expect(await screen.findByTestId('day-label')).toHaveTextContent(/^Today · /);
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Today' })).toBeNull();
    expect(await screen.findByTestId('panel-day')).toHaveTextContent(day(0));
  });

  it('is one row: no heading, no Yesterday button, no second date field', async () => {
    renderPage();
    const stepper = await screen.findByTestId('day-stepper');
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yesterday' })).toBeNull();
    expect(stepper.querySelectorAll('input[type="date"]')).toHaveLength(1);
    expect(document.querySelectorAll('input[type="date"]')).toHaveLength(1);
  });

  it('Previous day steps back one calendar day and says Yesterday', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Previous day' }));
    expect(screen.getByTestId('day-label')).toHaveTextContent(/^Yesterday · /);
    expect(screen.getByTestId('panel-day')).toHaveTextContent(day(-1));
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
  });

  it('two steps back names the date, and Today comes back', async () => {
    renderPage();
    const prev = await screen.findByRole('button', { name: 'Previous day' });
    fireEvent.click(prev);
    fireEvent.click(prev);
    expect(screen.getByTestId('panel-day')).toHaveTextContent(day(-2));
    expect(screen.getByTestId('day-label')).not.toHaveTextContent(/Today|Yesterday/);
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByTestId('day-label')).toHaveTextContent(/^Today · /);
    expect(screen.getByTestId('panel-day')).toHaveTextContent(day(0));
  });

  it('the day itself is the date picker: any earlier day, never a later one', async () => {
    renderPage();
    const picker = await screen.findByLabelText(/Choose another day/);
    expect(picker).toHaveAttribute('max', day(0));
    fireEvent.change(picker, { target: { value: day(-9) } });
    expect(screen.getByTestId('panel-day')).toHaveTextContent(day(-9));
    // A cleared field is not a day: the page stays where it was.
    fireEvent.change(picker, { target: { value: '' } });
    expect(screen.getByTestId('panel-day')).toHaveTextContent(day(-9));
  });
});

describe('the sections', () => {
  it('four short names that fit a phone; setup is not one of them', async () => {
    renderPage();
    const tabs = within(await screen.findByTestId('health-tabs')).getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Overview', 'Sleep', 'Meals', 'Recovery']);
    expect(screen.getByRole('tablist', { name: 'Health sections' })).toBeInTheDocument();
  });

  it('switching section swaps the panel', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Sleep' }));
    expect(await screen.findByTestId('panel-sleep')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-day')).toBeNull();
  });

  it('the page copy never names the server or the database', async () => {
    renderPage();
    await screen.findByTestId('panel-day');
    expect(document.body.textContent).not.toMatch(/InfluxDB|home data server/i);
  });

  it('watch settings sit at the foot, closed until asked for', async () => {
    renderPage();
    const toggle = await screen.findByTestId('watch-settings-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('setup-form')).toBeNull();
    fireEvent.click(toggle);
    expect(await screen.findByTestId('setup-form')).toBeInTheDocument();
  });
});

describe('a person with no watch', () => {
  beforeEach(() => get.mockResolvedValue({ data: { influxEnabled: false } }));

  it('gets one friendly card: no tabs, no day control, no setup form, no server names', async () => {
    renderPage();
    const card = await screen.findByTestId('connect-watch');
    expect(card).toHaveTextContent('Connect a Garmin watch to see heart rate, sleep and recovery here.');
    expect(screen.queryByTestId('health-tabs')).toBeNull();
    expect(screen.queryByTestId('day-stepper')).toBeNull();
    expect(screen.queryByTestId('setup-form')).toBeNull();
    expect(document.body.textContent).not.toMatch(/InfluxDB|home data server/i);
  });

  it('the setup is behind the button, and turning it on opens the page', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Set it up' }));
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings#garmin');
    fireEvent.click(screen.getByTestId('setup-form'));
    expect(await screen.findByTestId('health-tabs')).toBeInTheDocument();
  });
});

describe('a failed settings read', () => {
  it('is said as a failure with a retry, never shown as "no watch"', async () => {
    get.mockRejectedValueOnce(new Error('Network Error'));
    renderPage();
    expect(await screen.findByText('Couldn’t load your health data')).toBeInTheDocument();
    expect(screen.queryByTestId('connect-watch')).toBeNull();
    expect(screen.queryByText(/Network Error/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('health-tabs')).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});
