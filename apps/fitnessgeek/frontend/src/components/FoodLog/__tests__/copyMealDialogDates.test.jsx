/**
 * FITNESSGEEK_REVIEW: Copy Meal could silently overwrite TODAY instead of
 * writing to tomorrow — data loss, not a display glitch.
 *
 * `currentDate` is a CALENDAR date (`YYYY-MM-DD`, the day the food log page
 * is showing), not an instant. The old code did:
 *
 *   const tomorrow = new Date(currentDate);   // parsed as UTC midnight
 *   tomorrow.setDate(tomorrow.getDate() + 1); // getDate/setDate run LOCAL
 *
 * For anyone west of UTC, `new Date('YYYY-MM-DD')` names an instant that
 * falls on the PREVIOUS local day (UTC midnight is 7pm the day before in
 * Central), so `.getDate()` read that previous day and `+1` landed back on
 * today. This is NOT a "before 7pm" bug — `new Date(currentDate)` never
 * depends on the real wall clock, only on the fixed string passed in, so it
 * reproduced at every hour tested (00:00, 06:00, 12:00, 18:00, 19:00, 20:00,
 * 23:00 Central — see the sibling verification script). The dialog's own
 * default "Copy To" date, and every quick-copy preset that targets
 * "tomorrow", silently pointed at the day already showing. The mirror bug
 * hit "yesterday": it landed two days back instead of one.
 *
 * The fix (`shiftDate` in `CopyMealDialog.jsx`) mirrors
 * `pages/FoodLog.jsx`'s `goToPreviousDay`/`goToNextDay`: destructure
 * year/month/day and build the `Date` in local time from the start, so
 * `setDate` never crosses a UTC/local day boundary it didn't create.
 *
 * These assertions pin the ACTUAL target date, not merely that the dialog
 * renders — a test that only checks rendering would pass with the bug still
 * in place.
 *
 * Runs under TZ=America/Chicago (set below, before the component is
 * imported) so the off-by-one is actually reachable.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

process.env.TZ = 'America/Chicago';

vi.mock('../../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: {
    getHouseholdMembers: vi.fn().mockResolvedValue({ data: { members: [] } }),
    copyMeal: vi.fn().mockResolvedValue({ message: 'ok' }),
    // Same shape as the real implementation (services/fitnessGeekService.js):
    // a string passes through, a Date is folded to its LOCAL calendar day.
    formatDate: (date) => {
      if (typeof date === 'string') return date;
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    },
  },
}));

const { default: CopyMealDialog } = await import('../CopyMealDialog.jsx');

// The day the food log page is showing — a Saturday.
const CURRENT_DATE = '2026-09-19';
const TOMORROW = '2026-09-20';
const YESTERDAY = '2026-09-18';

describe('CopyMealDialog targets the real adjacent calendar day', () => {
  beforeAll(() => {
    // Sanity: the environment really is west of UTC, or none of this proves
    // anything. `new Date(CURRENT_DATE)` must read back as the PREVIOUS day
    // locally for the bug to be reachable at all.
    expect(new Date(CURRENT_DATE).getDate()).toBe(18);
  });

  it('defaults "Copy To" to tomorrow, not today', () => {
    render(
      <CopyMealDialog open currentDate={CURRENT_DATE} onClose={() => {}} onCopyComplete={() => {}} />
    );

    const dateInputs = screen.getAllByLabelText('Date');
    const [fromInput, toInput] = dateInputs;

    expect(fromInput.value).toBe(CURRENT_DATE);
    expect(toInput.value).toBe(TOMORROW);
    expect(toInput.value).not.toBe(CURRENT_DATE);
  });

  it('"Dinner → Tomorrow\'s Lunch" targets tomorrow, not today', () => {
    render(
      <CopyMealDialog open currentDate={CURRENT_DATE} onClose={() => {}} onCopyComplete={() => {}} />
    );

    fireEvent.click(screen.getByText("Dinner → Tomorrow's Lunch"));

    const [fromInput, toInput] = screen.getAllByLabelText('Date');
    expect(fromInput.value).toBe(CURRENT_DATE);
    expect(toInput.value).toBe(TOMORROW);
  });

  it('"Yesterday\'s Dinner → Today\'s Lunch" reads from yesterday, not two days back', () => {
    render(
      <CopyMealDialog open currentDate={CURRENT_DATE} onClose={() => {}} onCopyComplete={() => {}} />
    );

    fireEvent.click(screen.getByText("Yesterday's Dinner → Today's Lunch"));

    const [fromInput, toInput] = screen.getAllByLabelText('Date');
    expect(fromInput.value).toBe(YESTERDAY);
    expect(toInput.value).toBe(CURRENT_DATE);
  });

  it('"Copy Entire Day" targets tomorrow, not today', () => {
    render(
      <CopyMealDialog open currentDate={CURRENT_DATE} onClose={() => {}} onCopyComplete={() => {}} />
    );

    fireEvent.click(screen.getByText('Copy Entire Day'));

    const [fromInput, toInput] = screen.getAllByLabelText('Date');
    expect(fromInput.value).toBe(CURRENT_DATE);
    expect(toInput.value).toBe(TOMORROW);
  });
});
