/**
 * The default-mode rule (DOCS/SIMPLE_AND_FULL_PLAN.md, Decisions): a person
 * who has chosen gets what they chose; one who never chose gets Full if they
 * have logged anything — food, a weight, a blood pressure — in the last 90
 * days, otherwise Simple. No user ids anywhere.
 *
 * Dates are fixed strings, never the clock, so this cannot pass or fail by
 * the hour it runs.
 */
import { describe, it, expect } from 'vitest';
import { daysBefore, decideMode, hasRecentActivity, rowDay } from '../experience.js';

const TODAY = '2026-09-27';
const log = (day) => ({ id: day, log_date: `${day}T00:00:00.000Z` });

describe('decideMode', () => {
  it('a saved choice wins, whatever the history says', () => {
    expect(decideMode({ savedMode: 'simple', activity: { foodLogs: [log(TODAY)] }, today: TODAY })).toBe('simple');
    expect(decideMode({ savedMode: 'full', activity: {}, today: TODAY })).toBe('full');
  });

  it('never chose + logged food this week → Full (Chef)', () => {
    expect(decideMode({ savedMode: null, activity: { foodLogs: [log('2026-09-25')] }, today: TODAY })).toBe('full');
  });

  it('never chose + nothing logged ever → Simple (Heather)', () => {
    expect(decideMode({ savedMode: null, activity: { foodLogs: [], weights: [], bloodPressures: [] }, today: TODAY })).toBe('simple');
    expect(decideMode({ savedMode: undefined, activity: undefined, today: TODAY })).toBe('simple');
  });

  it('a weight or a blood pressure counts as logging, not just food', () => {
    expect(decideMode({ savedMode: null, activity: { weights: [log('2026-08-01')] }, today: TODAY })).toBe('full');
    expect(decideMode({ savedMode: null, activity: { bloodPressures: [log('2026-07-15')] }, today: TODAY })).toBe('full');
  });

  it('the window is 90 days: day 90 counts, day 91 does not', () => {
    const day90 = daysBefore(TODAY, 90);
    const day91 = daysBefore(TODAY, 91);
    expect(decideMode({ savedMode: null, activity: { foodLogs: [log(day90)] }, today: TODAY })).toBe('full');
    expect(decideMode({ savedMode: null, activity: { foodLogs: [log(day91)] }, today: TODAY })).toBe('simple');
  });

  it('an unknown saved value is "never chose", not a mode', () => {
    expect(decideMode({ savedMode: 'expert', activity: {}, today: TODAY })).toBe('simple');
  });
});

describe('the helpers', () => {
  it('daysBefore crosses month and year boundaries', () => {
    expect(daysBefore('2026-03-01', 1)).toBe('2026-02-28');
    expect(daysBefore('2026-01-01', 1)).toBe('2025-12-31');
    expect(daysBefore(TODAY, 90)).toBe('2026-06-29');
  });

  it('a stored log date IS its calendar day, in any timezone', () => {
    expect(rowDay({ log_date: '2026-09-26T00:00:00.000Z' })).toBe('2026-09-26');
    expect(rowDay({ log_date: 'not a date' })).toBeNull();
    expect(hasRecentActivity({ foodLogs: [{ log_date: null }] }, TODAY)).toBe(false);
  });
});
