/**
 * The shaded fill under a day chart stops at the axis.
 *
 * Nivo fills an area down to `areaBaselineValue`, which defaults to 0. The
 * heart-rate charts let the y axis start wherever the data did (about 50) and
 * passed no baseline, so the fill ran far below the plot and over the time
 * labels ("12 AM", "6 AM"). Both charts now give the axis and the fill the
 * same floor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { chartFloor, toTimeSeries } from '../intradaySeries.js';

process.env.TZ = 'America/Chicago';

const charts = [];
vi.mock('@nivo/line', () => ({
  ResponsiveLine: (props) => {
    charts.push(props);
    return <svg role="img" aria-label={props.ariaLabel} />;
  },
}));

const getIntraday = vi.fn();
vi.mock('../../services/influxService', () => ({ influxService: { getIntraday: (...a) => getIntraday(...a) } }));
const logs = vi.fn();
vi.mock('../../services/apiService', () => ({ apiService: { get: (...a) => logs(...a) } }));

const { default: IntradayDashboard } = await import('../IntradayDashboard.jsx');
const { default: MealImpactVisualization } = await import('../MealImpactVisualization.jsx');

const DAY = '2026-10-16';
const at = (i) => new Date(Date.UTC(2026, 9, 16, 16, 0) + i * 5 * 60000).toISOString();
// Heart rate between 53 and 141: an axis that does not start at 0.
const heartRate = Array.from({ length: 40 }, (_, i) => ({ time: at(i), HeartRate: i === 20 ? 141 : 53 + (i % 9) }));
const stress = Array.from({ length: 40 }, (_, i) => ({ time: at(i), stressLevel: 20 + (i % 30) }));
const bodyBattery = Array.from({ length: 40 }, (_, i) => ({ time: at(i), BodyBatteryLevel: 80 - i }));

const lastChart = (label) => [...charts].reverse().find((c) => c.ariaLabel.startsWith(label));
const fillStopsAtTheAxis = (chart) => {
  expect(chart.enableArea).toBe(true);
  expect(Number.isFinite(chart.yScale.min)).toBe(true);
  expect(chart.areaBaselineValue).toBe(chart.yScale.min);
  // Room for the time labels under the plot.
  expect(chart.margin.bottom).toBeGreaterThanOrEqual(28);
};

beforeEach(() => {
  charts.length = 0;
  getIntraday.mockReset();
  logs.mockReset();
  getIntraday.mockResolvedValue({ heartRate, stress, bodyBattery, breathing: [] });
});

describe('chartFloor', () => {
  const series = (ys) => toTimeSeries(ys.map((y, i) => ({ time: at(i), value: y })), 'x', '#000');

  it('a fixed range wins', () => {
    expect(chartFloor(series([40, 50]), [0, 100])).toBe(0);
  });
  it('otherwise the lowest reading rounded down to a ten, with air under the line', () => {
    expect(chartFloor(series([53, 141, 60]))).toBe(50);
    expect(chartFloor(series([60, 70]))).toBe(50);
    expect(chartFloor(series([61, 70]))).toBe(60);
  });
  it('never below zero for readings that are not negative, and 0 for nothing', () => {
    expect(chartFloor(series([0, 4, 9]))).toBe(0);
    expect(chartFloor([])).toBe(0);
    expect(chartFloor(undefined)).toBe(0);
  });
});

describe('Health › Overview: every chart', () => {
  it('heart rate, stress and Body Battery all fill down to their own axis, never past it', async () => {
    render(<IntradayDashboard date={DAY} />);
    await screen.findByRole('img', { name: /^Heart rate through the day/ });
    const hr = lastChart('Heart rate');
    fillStopsAtTheAxis(hr);
    expect(hr.yScale.min).toBe(50);
    for (const label of ['Stress', 'Body Battery']) {
      const chart = lastChart(label);
      fillStopsAtTheAxis(chart);
      expect(chart.yScale).toMatchObject({ min: 0, max: 100 });
    }
  });
});

describe('Health › Meals: the chart', () => {
  const row = {
    id: 'l1', log_date: `${DAY}T00:00:00.000Z`, meal_type: 'lunch', servings: 1,
    nutrition: { calories_per_serving: 95, protein_grams: 10 },
    food_item_id: { id: 'f1', name: 'Greek yogurt' },
    created_at: '2026-10-16T17:30:00.000Z',
  };

  it('fills down to its axis for heart rate and for the 0 to 100 measures', async () => {
    logs.mockResolvedValue({ success: true, data: [row] });
    render(<MealImpactVisualization date={DAY} />);
    await screen.findByRole('img', { name: /^Heart rate through the day/ });
    const hr = lastChart('Heart rate');
    fillStopsAtTheAxis(hr);
    expect(hr.yScale.min).toBe(50);

    fireEvent.click(screen.getByRole('button', { name: 'Stress' }));
    await waitFor(() => expect(lastChart('Stress')).toBeTruthy());
    fillStopsAtTheAxis(lastChart('Stress'));
    expect(lastChart('Stress').yScale).toMatchObject({ min: 0, max: 100 });
  });

  it('each of the three readings has its one plain line of explanation', async () => {
    logs.mockResolvedValue({ success: true, data: [row] });
    render(<MealImpactVisualization date={DAY} />);
    expect(await screen.findByText('How your body answered each meal')).toBeInTheDocument();
    expect(screen.getByText(/^Beats a minute, as your watch read them\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stress' }));
    expect(await screen.findByText(/Lower is calmer\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Energy' }));
    expect(await screen.findByText(/^Energy is Body Battery: /)).toBeInTheDocument();
  });
});
