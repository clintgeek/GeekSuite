/**
 * The Health dashboard's day header: previous / next around a heavy
 * "Today" / "Yesterday" / the date in words, the Yesterday and Today
 * shortcuts, and the native picker for any other day. The tabs keep their
 * names.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@geeksuite/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../services/apiService', () => ({
  apiService: { get: vi.fn().mockResolvedValue({ data: { influxEnabled: true } }) },
}));
// Each panel reports the day it was handed, so the test sees the day change.
vi.mock('../../components/IntradayDashboard', () => ({ default: ({ date }) => <div data-testid="panel-day">{date}</div> }));
vi.mock('../../components/SleepAnalysis', () => ({ default: () => <div /> }));
vi.mock('../../components/MealImpactVisualization', () => ({ default: () => <div /> }));
vi.mock('../../components/RecoveryCoach', () => ({ default: () => <div /> }));
vi.mock('../../components/InfluxDBSettings', () => ({ default: () => <div /> }));

import HealthDashboard from '../HealthDashboard.jsx';
import { localDateString } from '@geeksuite/utils';

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localDateString(d);
};

beforeEach(() => vi.clearAllMocks());

describe('HealthDashboard day header', () => {
  it('opens on Today, with Next day disabled', async () => {
    render(<HealthDashboard />);
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
    expect(await screen.findByTestId('panel-day')).toHaveTextContent(day(0));
  });

  it('Previous day steps back one calendar day and says Yesterday', async () => {
    render(<HealthDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Previous day' }));
    expect(await screen.findByRole('heading', { name: 'Yesterday' })).toBeInTheDocument();
    expect(screen.getByTestId('panel-day')).toHaveTextContent(day(-1));
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled();
  });

  it('two steps back names the date in words, and Today comes back', async () => {
    render(<HealthDashboard />);
    const prev = await screen.findByRole('button', { name: 'Previous day' });
    fireEvent.click(prev);
    fireEvent.click(prev);
    expect(screen.getByTestId('panel-day')).toHaveTextContent(day(-2));
    expect(screen.queryByRole('heading', { name: 'Today' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByTestId('panel-day')).toHaveTextContent(day(0));
  });

  it('the Yesterday shortcut and all five tabs are still there', async () => {
    render(<HealthDashboard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));
    expect(screen.getByTestId('panel-day')).toHaveTextContent(day(-1));
    const tabs = within(screen.getByTestId('health-tabs')).getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Overview', 'Sleep analysis', 'Meal impact', 'Recovery coach', 'Settings']);
  });
});
