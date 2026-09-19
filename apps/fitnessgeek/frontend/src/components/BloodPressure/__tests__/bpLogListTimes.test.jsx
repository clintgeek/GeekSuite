/**
 * The owner's Omron cuff is read morning and evening — two readings on the
 * same calendar day is the normal case now that the backend's one-per-day
 * rejection is gone (`(userId, measured_at)` is the new dedupe key; see
 * `packages/schemas/fitnessgeek/bloodPressure.js`'s header). `BPLogList`
 * used to identify a row by its `log_date` alone, which has no time
 * component — two same-day readings rendered as two rows with an identical
 * date string and nothing to tell them apart, and there was no way to know
 * which was the morning reading and which was the evening one.
 *
 * These pin: (1) two same-day readings show two DIFFERENT times, not the
 * same date twice, and (2) they come out in a sensible order (most recent
 * first, consistent with the day-level "newest first" sort that was already
 * there). Runs under TZ=America/Chicago, set before the component is
 * imported, so this isn't accidentally passing because the environment
 * happens to be UTC.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

process.env.TZ = 'America/Chicago';

const { default: BPLogList } = await import('../BPLogList.jsx');

// Same calendar day, morning and evening. 13:00Z / 23:30Z in Chicago (CDT,
// UTC-5) is 08:00 AM / 06:30 PM — both still June 1st locally.
const MORNING = {
  id: 'bp-morning',
  systolic: 118,
  diastolic: 76,
  pulse: 62,
  log_date: '2026-06-01T00:00:00.000Z',
  measured_at: '2026-06-01T13:00:00.000Z',
};
const EVENING = {
  id: 'bp-evening',
  systolic: 128,
  diastolic: 82,
  pulse: 70,
  log_date: '2026-06-01T00:00:00.000Z',
  measured_at: '2026-06-01T23:30:00.000Z',
};

describe('BPLogList — two readings, one day', () => {
  it('shows two distinct times, not the same date twice with nothing to tell them apart', () => {
    render(<BPLogList logs={[MORNING, EVENING]} onDelete={() => {}} />);

    // Each row renders twice (mobile + desktop layouts) — look for the time
    // strings rather than counting rows.
    expect(screen.getAllByText(/8:00\s?AM/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/6:30\s?PM/i).length).toBeGreaterThan(0);
  });

  it('orders same-day readings newest-first, matching the day-level sort', () => {
    const { container } = render(<BPLogList logs={[MORNING, EVENING]} onDelete={() => {}} />);

    // The mobile layout's systolic/diastolic text nodes appear in DOM order;
    // the evening reading (128/82) should come before the morning one
    // (118/76) since the whole list sorts newest-first.
    const text = container.textContent;
    expect(text.indexOf('128/82')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('118/76')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('128/82')).toBeLessThan(text.indexOf('118/76'));
  });

  it('does not print a time for a row with no measured_at, rather than a fabricated one', () => {
    const noTime = { id: 'bp-legacy', systolic: 120, diastolic: 78, log_date: '2026-06-02T00:00:00.000Z' };
    render(<BPLogList logs={[noTime]} onDelete={() => {}} />);

    expect(screen.queryByText(/\d{1,2}:\d{2}\s?(AM|PM)/i)).toBeNull();
  });
});

describe('BPLogList — edit affordance', () => {
  it('renders an edit control per row and calls onEdit with that row', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const onEdit = (log) => { onEdit.calledWith = log; };

    render(<BPLogList logs={[MORNING]} onDelete={() => {}} onEdit={onEdit} />);

    const editButtons = screen.getAllByRole('button', { name: /edit the 118\/76 mmhg reading/i });
    expect(editButtons.length).toBeGreaterThan(0);

    await user.click(editButtons[0]);
    expect(onEdit.calledWith).toBe(MORNING);
  });

  it('renders no edit control when onEdit is not provided', () => {
    render(<BPLogList logs={[MORNING]} onDelete={() => {}} />);
    expect(screen.queryByRole('button', { name: /edit the/i })).toBeNull();
  });
});
