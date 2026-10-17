/**
 * UX review 2026-10-17, D-2 / D-3 / L25 — the weight goal card stops
 * contradicting itself.
 *
 * The review's case: goal 232 → 195, Jun 18 → Dec 1 (the dates need ~1.6 lb
 * a week), a stored rate of 1.0, an actual pace of 1.3, a 7-day average of
 * 219.9. The card said "Goal: 1.0 lbs/week" (faster than goal) beside a red
 * "88 days behind" (behind) and "32.7% Complete".
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createFitnessTheme } from '../../../theme/theme.jsx';

process.env.TZ = 'America/Chicago';
const { default: WeightProgress } = await import('../WeightProgress.jsx');
const { neededPacePerWeek, currentAverage } = await import('../weightTrend.js');

const GOAL = {
  enabled: true, startWeight: 232, targetWeight: 195,
  startDate: '2026-06-18T00:00:00.000Z', goalDate: '2026-12-01T00:00:00.000Z', ratePerWeek: -1,
};
// Daily weigh-ins from the start, a steady 1.3 lb a week down.
const logs = Array.from({ length: 122 }, (_, i) => ({
  id: `w${i}`,
  log_date: new Date(Date.UTC(2026, 5, 18 + i)).toISOString(),
  weight_value: Math.round((232 - (1.3 / 7) * i) * 10) / 10,
}));

const renderCard = (props = {}) => render(
  <ThemeProvider theme={createFitnessTheme('light')}>
    <WeightProgress weightLogs={logs} goal={GOAL} currentWeight={219.9} unit="lbs" onEditGoal={() => {}} {...props} />
  </ThemeProvider>
);

describe('the weight goal card (Full)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00-05:00'));
  });
  afterAll(() => vi.useRealTimers());

  it("puts her pace beside the pace the goal's dates need — not the stored 1.0", () => {
    renderCard();
    expect(screen.getByTestId('weight-pace')).toHaveTextContent('You’re losing 1.3 lb a week. To reach 195 by Dec 1 you’d need 1.6.');
    expect(document.body.textContent).not.toMatch(/Goal: 1\.0/);
  });

  it('counts the pounds, not a percent', () => {
    renderCard();
    expect(screen.getByTestId('weight-progress-count')).toHaveTextContent('12.1 of 37 lb lost');
    expect(document.body.textContent).not.toMatch(/% Complete/);
  });

  it('says which number "to go" is measured from (D-3)', () => {
    renderCard();
    expect(screen.getByText('24.9 lb to go')).toBeInTheDocument();
    expect(screen.getByTestId('weight-basis')).toHaveTextContent('From your 7-day average, 219.9 lb');
  });

  // Visual review B2: the produce colours mean meals only, so "behind" is a
  // warm warning wash (warning.main #9A5B00 at 14%), still never red.
  it('behind plan is said in words, in a warning wash, never red, and without a day count', () => {
    renderCard();
    const chip = screen.getByTestId('weight-status');
    expect(chip).toHaveTextContent('Behind plan');
    expect(document.body.textContent).not.toMatch(/days behind/);
    const bg = window.getComputedStyle(chip).backgroundColor;
    expect(bg).toBe('rgba(154, 91, 0, 0.14)');
    expect(bg).not.toBe('rgb(246, 201, 69)'); // not the Dinner lemon
  });

  it('the start weight is muted ink, not alpha grey (A7)', () => {
    renderCard();
    // StatNumber renders the start weight first, then the target in basil.
    const start = screen.getAllByText('232')[0];
    expect(window.getComputedStyle(start).color).toBe('rgb(107, 88, 71)'); // text.muted #6B5847
  });

  it('the projection is in words, against the goal date', () => {
    renderCard();
    const projection = screen.getByTestId('weight-projection');
    expect(projection).toHaveTextContent(/^At this pace: (early|mid|late) [A-Z][a-z]+( 2027)?/);
    expect(projection).toHaveTextContent(/about \d+ (weeks?|months?) after your goal date/);
  });
});

describe('Simple (L25)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00-05:00'));
  });
  afterAll(() => vi.useRealTimers());

  it('leads with the trend in words and keeps the goal maths out of her face', () => {
    renderCard({ simple: true });
    expect(screen.getByTestId('weight-trend-words')).toHaveTextContent('Down 12.1 lb since June');
    expect(screen.getByText('From your 7-day average, 219.9 lb')).toBeInTheDocument();
    expect(screen.queryByTestId('weight-status')).toBeNull();
    expect(screen.queryByTestId('weight-pace')).toBeNull();
    expect(screen.queryByTestId('weight-projection')).toBeNull();
    expect(document.body.textContent).not.toMatch(/behind/i);
  });

  it('with no goal, still leads with the trend once there are two weeks of weigh-ins', () => {
    renderCard({ simple: true, goal: null, currentWeight: null });
    expect(screen.getByTestId('weight-trend-words')).toHaveTextContent(/^Down \d+\.\d lb since June$/);
  });
});

describe('one basis for "now" (D-3)', () => {
  it('currentAverage is the latest 7-day mean, not the latest reading', () => {
    const rows = [
      { log_date: '2026-10-10T00:00:00.000Z', weight_value: 220 },
      { log_date: '2026-10-12T00:00:00.000Z', weight_value: 221 },
      { log_date: '2026-10-16T00:00:00.000Z', weight_value: 218.7 },
    ];
    expect(currentAverage(rows)).toBeCloseTo((220 + 221 + 218.7) / 3, 5);
  });

  it("neededPacePerWeek is the dates' pace", () => {
    expect(neededPacePerWeek(GOAL)).toBeCloseTo(37 / (166 / 7), 5);
  });
});
