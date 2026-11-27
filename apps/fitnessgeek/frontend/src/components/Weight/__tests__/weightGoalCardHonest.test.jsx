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

describe('the weight goal card', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00-05:00'));
  });
  afterAll(() => vi.useRealTimers());

  it("puts her pace beside the pace the goal's dates need — not the stored 1.0", () => {
    renderCard();
    expect(screen.getByTestId('weight-pace')).toHaveTextContent('Pace 1.3 lb a week · your plan needs 1.6');
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
    // The big number IS the basis, and is named as that right under it.
    expect(screen.getByTestId('weight-now')).toHaveTextContent('219.9 lb');
    expect(screen.getByTestId('weight-basis')).toHaveTextContent('7-day average');
  });

  // Round two: someone down 12 lb read "Behind plan", "Off track" and "well
  // past your goal date". The card no longer grades her: no status tag, and
  // the missed date is said once, as information, with a way to move it.
  it('does not scold: no status tag, and the missed date is said once, plainly', () => {
    renderCard();
    expect(screen.queryByTestId('weight-status')).toBeNull();
    const text = document.body.textContent;
    expect(text).not.toMatch(/Behind plan|Off track|On track|days behind|well past|twice the plan/i);
    // Truthful: the date will be missed, and it says so, once.
    expect(text.match(/after your Dec 1 goal date/g)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Move the date or change the goal' })).toBeInTheDocument();
  });

  it('on pace, the link is just "Change goal" and nothing says the date is missed', () => {
    // 1.6 lb a week from the start is what the dates need.
    const onPace = Array.from({ length: 122 }, (_, i) => ({
      id: `p${i}`,
      log_date: new Date(Date.UTC(2026, 5, 18 + i)).toISOString(),
      weight_value: Math.round((232 - (37 / 166) * i) * 10) / 10,
    }));
    renderCard({ weightLogs: onPace, currentWeight: 205.6 });
    expect(screen.getByTestId('weight-projection')).toHaveTextContent(/right about your goal date\.$/);
    expect(screen.getByRole('button', { name: 'Change goal' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/after your/);
  });

  // The harness's own case: a goal whose pace lands more than two plan
  // lengths out used to read "At this pace: well past your goal date / the
  // finish is more than twice the plan's length out".
  it('a finish a long way past the date is still a month, said kindly', () => {
    vi.setSystemTime(new Date('2026-11-27T12:00:00-06:00'));
    try {
      const goal = { ...GOAL, startDate: '2026-09-19T00:00:00.000Z' };
      const late = Array.from({ length: 70 }, (_, i) => ({
        id: `s${i}`,
        log_date: new Date(Date.UTC(2026, 8, 19 + i)).toISOString(),
        weight_value: Math.round((232 - (1.3 / 7) * i) * 10) / 10,
      }));
      renderCard({ goal, weightLogs: late, currentWeight: 219.9 });
      const projection = screen.getByTestId('weight-projection');
      expect(projection).toHaveTextContent(/^At this pace you’d get there around [A-Z][a-z]+ 2027, about \d+ months after your Dec 1 goal date\./);
      expect(projection).toHaveTextContent('That’s still steady progress.');
      expect(document.body.textContent).not.toMatch(/well past|twice the plan/);
    } finally {
      vi.setSystemTime(new Date('2026-10-17T12:00:00-05:00'));
    }
  });

  it('shows where the program started, as a fact row in ink (A7)', () => {
    renderCard();
    const row = screen.getByText('Started').closest('div');
    expect(row).toHaveTextContent('Started 232 lb');
    expect(window.getComputedStyle(row).color).not.toMatch(/rgba\(.*, 0\.\d+\)/); // not alpha grey
  });

  it('the projection is in words, against the goal date', () => {
    renderCard();
    const projection = screen.getByTestId('weight-projection');
    expect(projection).toHaveTextContent(/^At this pace you’d get there around (early|mid|late) [A-Z][a-z]+( 2027)?, about \d+ (weeks?|months?) after your Dec 1 goal date\./);
  });
});

describe('the trend in words (L25)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00-05:00'));
  });
  afterAll(() => vi.useRealTimers());

  it('leads with the trend in words, with the goal maths below it', () => {
    renderCard();
    expect(screen.getByTestId('weight-trend-words')).toHaveTextContent('Down 12.1 lb since June');
    expect(screen.getByText('7-day average')).toBeInTheDocument();
    expect(screen.getAllByTestId('weight-basis')).toHaveLength(1);
    expect(screen.getByTestId('weight-pace')).toBeInTheDocument();
    expect(screen.getByTestId('weight-projection')).toBeInTheDocument();
  });

  it('with no goal, still leads with the trend once there are two weeks of weigh-ins', () => {
    renderCard({ goal: null, currentWeight: null });
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

  // A person who weighs in but never set a goal opened this card to "No
  // weight goal yet" and no number at all.
  it('with no goal, the number is still the first thing on the card', () => {
    renderCard({ goal: null, currentWeight: 219.9 });
    expect(screen.getByTestId('weight-now')).toHaveTextContent('219.9 lb');
    expect(screen.getByTestId('weight-basis')).toHaveTextContent('7-day average');
    expect(screen.getByRole('button', { name: /set your goal/i })).toBeInTheDocument();
  });

  it('with no goal and no weigh-ins there is no number to show', () => {
    renderCard({ goal: null, currentWeight: null, weightLogs: [] });
    expect(screen.queryByTestId('weight-now')).toBeNull();
  });

  it('the percent sits on the goal bar, with no orphaned "% of goal" heading or "Amount this week"', () => {
    renderCard();
    expect(document.body.textContent).not.toMatch(/% of goal|Amount this week/);
    expect(screen.getByText('33%')).toBeInTheDocument();
  });
});

describe('a goal that could not be read', () => {
  it('says so and offers a retry, never "No weight goal yet"', () => {
    const onRetryGoal = vi.fn();
    renderCard({ goal: null, goalUnknown: true, onRetryGoal });
    expect(screen.getByTestId('weight-goal-unknown')).toHaveTextContent('Couldn’t load your goal');
    expect(screen.queryByText('No weight goal yet')).toBeNull();
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(onRetryGoal).toHaveBeenCalled();
  });
});
