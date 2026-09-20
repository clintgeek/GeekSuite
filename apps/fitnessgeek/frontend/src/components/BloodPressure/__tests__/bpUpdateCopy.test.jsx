/**
 * AddBPDialog and QuickAddBP used to warn "you already have a reading for
 * today" and, after an earlier fix, "editing isn't supported yet — delete
 * today's reading first". Both described a restriction that no longer
 * exists: the backend's one-reading-per-calendar-day rejection was removed
 * in favor of the `(userId, measured_at)` unique index, because a home cuff
 * is read morning AND evening (see the shared schema's header,
 * `packages/schemas/fitnessgeek/bloodPressure.js`). AddBPDialog now also
 * actually supports editing, via a `mode="edit"` + `initialValues` prefill
 * wired from `BPLogList`'s edit affordance through to `bpService.updateBPLog`
 * (see `pages/BloodPressure.jsx`). This test pins that neither the false
 * "will replace" claim nor the "editing unsupported" claim survives, and
 * that edit mode actually presents and prefills itself as an edit.
 *
 * Goes red against a version that still renders the old banner/copy or that
 * doesn't prefill an edit; green once both are gone/present.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

process.env.TZ = 'America/Chicago';

const { default: AddBPDialog } = await import('../AddBPDialog.jsx');
const { default: QuickAddBP } = await import('../QuickAddBP.jsx');

describe('Blood pressure — obsolete same-day copy is gone', () => {
  it('AddBPDialog never claims a replace, and never says editing is unsupported', () => {
    render(<AddBPDialog open onClose={() => {}} onAdd={async () => {}} />);

    expect(screen.queryByText(/will replace the existing one/i)).toBeNull();
    expect(screen.queryByText(/editing isn.t supported/i)).toBeNull();
    expect(screen.queryByText(/already have a reading for today/i)).toBeNull();
  });

  it('QuickAddBP never claims a replace, and never says editing is unsupported', () => {
    render(<QuickAddBP onAdd={async () => {}} unit="mmHg" />);

    expect(screen.queryByText(/will replace the existing one/i)).toBeNull();
    expect(screen.queryByText(/editing isn.t supported/i)).toBeNull();
    expect(screen.queryByText(/already have a reading for today/i)).toBeNull();
  });
});

describe('AddBPDialog — edit mode actually edits', () => {
  const row = {
    id: 'bp1',
    systolic: 132,
    diastolic: 84,
    pulse: 70,
    log_date: '2026-06-01T00:00:00.000Z',
    // 13:30 UTC is 08:30 in America/Chicago (CDT) — same calendar day, so
    // this also pins that the split doesn't roll the date over.
    measured_at: '2026-06-01T13:30:00.000Z',
  };

  it('presents itself as an edit, not an add', () => {
    render(
      <AddBPDialog open mode="edit" initialValues={row} onClose={() => {}} onAdd={async () => {}} />
    );

    expect(screen.getByText('Edit Reading')).toBeInTheDocument();
    expect(screen.queryByText('Add Reading')).toBeNull();
  });

  it('pre-fills systolic, diastolic, pulse, date and time from the row', () => {
    render(
      <AddBPDialog open mode="edit" initialValues={row} onClose={() => {}} onAdd={async () => {}} />
    );

    expect(screen.getByLabelText(/systolic/i)).toHaveValue(132);
    expect(screen.getByLabelText(/diastolic/i)).toHaveValue(84);
    expect(screen.getByLabelText(/pulse/i)).toHaveValue(70);
    expect(screen.getByLabelText(/^time$/i)).toHaveValue('08:30');
  });
});
