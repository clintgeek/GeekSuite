/**
 * Meal impact reads the food-log rows the gateway really sends (d-fixes).
 *
 * It read `entry.name` and `entry.calories`, which GetFoodLogs rows don't
 * carry, so every card said "Meal" and "0 cal"; and it took `log_date` (the
 * day at UTC midnight) as the time, so no meal ever sat inside the day's
 * heart-rate data. The name is `food_item_id.name`, calories are per serving
 * times servings, and the time is `created_at` — only on rows written that
 * same day.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

process.env.TZ = 'America/Chicago';
vi.mock('@nivo/line', () => ({ ResponsiveLine: () => null }));

const DAY = '2026-10-16';
// Heart rate every 5 minutes, 11:00–14:30 local (16:00–19:30Z).
const hr = Array.from({ length: 43 }, (_, i) => ({
  time: new Date(Date.UTC(2026, 9, 16, 16, 0) + i * 5 * 60000).toISOString(),
  heart_rate: i < 18 ? 64 : 78,
}));
const row = (over) => ({
  id: 'l1', log_date: `${DAY}T00:00:00.000Z`, meal_type: 'lunch', servings: 2, notes: null,
  nutrition: { calories_per_serving: 95, protein_grams: 10 },
  food_item_id: { id: 'f1', name: 'Greek yogurt' },
  created_at: '2026-10-16T17:30:00.000Z', // 12:30 local
  ...over,
});

const logs = vi.fn();
vi.mock('../../services/apiService', () => ({ apiService: { get: (...a) => logs(...a) } }));
const intraday = vi.fn();
vi.mock('../../services/influxService', () => ({ influxService: { getIntraday: (...a) => intraday(...a) } }));

const { default: MealImpactVisualization } = await import('../MealImpactVisualization.jsx');

// Real readings, in the column name the route sends: 64 bpm before 12:30, 78 from 12:30 on (so the half hour before averages 66).
const realHr = hr.map((p) => ({ time: p.time, HeartRate: p.heart_rate }));

beforeEach(() => {
  logs.mockReset();
  intraday.mockReset();
  intraday.mockResolvedValue({ heartRate: hr, stress: [], bodyBattery: [] });
});
const { mealsFromLogs } = await import('../intradaySeries.js');

describe('Meal impact cards', () => {
  it('name the food and its calories from the real row shape', async () => {
    logs.mockResolvedValue({ success: true, data: [row()] });
    render(<MealImpactVisualization date={DAY} />);
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    expect(screen.getByText(/190 cal · Protein 20g/)).toBeInTheDocument();
    expect(screen.queryByText('Meal')).toBeNull();
  });

  it('a meal added on another day has no real time, and says so instead of guessing', async () => {
    logs.mockResolvedValue({ success: true, data: [row({ created_at: '2026-10-17T14:00:00.000Z' })] });
    render(<MealImpactVisualization date={DAY} />);
    expect(await screen.findByText(/added later, so I don’t know when you ate them/)).toBeInTheDocument();
  });
});

describe('mealsFromLogs', () => {
  it('times by created_at, never by the midnight log_date', () => {
    const { meals, untimed } = mealsFromLogs([row(), row({ id: 'l2', created_at: null })], DAY);
    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject({ name: 'Greek yogurt', calories: 190, protein: 20, time: '2026-10-16T17:30:00.000Z' });
    expect(untimed).toBe(1);
  });
});

describe('Meal impact: failed, empty and stale are told apart', () => {
  it('the food log failing is said as a failure, never "No meals logged for this day"', async () => {
    logs.mockRejectedValueOnce(new Error('Request failed with status code 502'));
    logs.mockResolvedValue({ success: true, data: [row()] });
    render(<MealImpactVisualization date={DAY} />);
    expect(await screen.findByText('Couldn’t load this day’s meals')).toBeInTheDocument();
    expect(screen.queryByText(/No meals logged/)).toBeNull();
    expect(screen.queryByText(/status code/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
  });

  it('a meal with no readings around it makes no finding', async () => {
    // The card used to say "This meal barely moved your heart rate, stress or
    // energy" when there was nothing measured at all.
    intraday.mockResolvedValue({ available: false, reason: 'no_data' });
    logs.mockResolvedValue({ success: true, data: [row()] });
    render(<MealImpactVisualization date={DAY} />);
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    expect(screen.getByTestId('meal-no-readings')).toBeInTheDocument();
    expect(screen.queryByText(/barely moved/)).toBeNull();
    expect(screen.getByTestId('meal-chart-missing')).toHaveTextContent(/No watch readings for this day/);
  });

  it('with readings, the before and after are numbers (never NaN)', async () => {
    intraday.mockResolvedValue({ heartRate: realHr, stress: [], bodyBattery: [] });
    logs.mockResolvedValue({ success: true, data: [row()] });
    const { container } = render(<MealImpactVisualization date={DAY} />);
    expect(await screen.findByText('66 → 78')).toBeInTheDocument();
    expect(screen.getByText('+12 bpm')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN/);
  });

  it('stepping to a day with no readings does not keep the last day\'s', async () => {
    intraday.mockResolvedValue({ heartRate: realHr, stress: [], bodyBattery: [] });
    logs.mockResolvedValue({ success: true, data: [row()] });
    const { rerender } = render(<MealImpactVisualization date={DAY} />);
    expect(await screen.findByText('66 → 78')).toBeInTheDocument();

    // The next day: a meal at the same clock time, and no readings at all.
    const NEXT = '2026-10-17';
    intraday.mockResolvedValue({ available: false, reason: 'no_data' });
    logs.mockResolvedValue({ success: true, data: [row({ log_date: `${NEXT}T00:00:00.000Z`, created_at: '2026-10-17T17:30:00.000Z' })] });
    rerender(<MealImpactVisualization date={NEXT} />);
    expect(await screen.findByTestId('meal-no-readings')).toBeInTheDocument();
    expect(screen.queryByText('66 → 78')).toBeNull();
    expect(screen.getByTestId('meal-chart-missing')).toBeInTheDocument();
  });

  it('the data server being down leaves the meals up and says why there is no line', async () => {
    intraday.mockRejectedValue(new Error('Network Error'));
    logs.mockResolvedValue({ success: true, data: [row()] });
    render(<MealImpactVisualization date={DAY} />);
    expect(await screen.findByText('Greek yogurt')).toBeInTheDocument();
    expect(screen.getByTestId('meal-chart-missing')).toHaveTextContent('Couldn’t reach your watch data just now.');
  });
});
